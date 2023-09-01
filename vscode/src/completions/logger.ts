import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'

import { isAbortError, isNetworkError, isRateLimitError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'
import { TelemetryEventProperties } from '@sourcegraph/cody-shared/src/telemetry'

import { logEvent } from '../services/EventLogger'
import { captureException } from '../services/sentry/sentry'

import { ContextSummary } from './context/context'
import { InlineCompletionItem } from './types'

export interface CompletionEvent {
    params: {
        type: 'inline'
        multiline: boolean
        multilineMode: null | 'block'
        providerIdentifier: string
        providerModel: string
        languageId: string
        contextSummary?: ContextSummary
        source?: string
        id: string
        lineCount?: number
        charCount?: number
    }
    // The timestamp when the completion request started
    startedAt: number
    // The timestamp when the completion fired off an eventual network request
    networkRequestStartedAt: number | null
    // Track wether or not we have already logged a start event for this
    // completion
    startLoggedAt: number | null
    // The time of when we have fully loaded a completion. This can happen
    // before we show it to the user, e.g. when the VS Code completions dropdown
    // prevents it from rendering
    loadedAt: number | null
    // The time of when the suggestion was first displayed to a users screen
    suggestedAt: number | null
    // The timestamp of when the suggestion was logged to our analytics backend
    // This is to avoid double-logging
    suggestionLoggedAt: number | null
    // The timestamp of when a completion was accepted and logged to our backend
    acceptedAt: number | null
}

const READ_TIMEOUT = 750

const displayedCompletions = new LRUCache<string, CompletionEvent>({
    max: 100, // Maximum number of completions that we are keeping track of
})

let completionsStartedSinceLastSuggestion = 0

export function logCompletionEvent(name: string, params?: TelemetryEventProperties): void {
    logEvent(`CodyVSCodeExtension:completion:${name}`, params)
}

export function create(inputParams: Omit<CompletionEvent['params'], 'multilineMode' | 'type' | 'id'>): string {
    const id = createId()
    const params: CompletionEvent['params'] = {
        ...inputParams,
        type: 'inline',
        // @deprecated: We only keep the legacy name for backward compatibility in analytics
        multilineMode: inputParams.multiline ? 'block' : null,
        id,
    }

    displayedCompletions.set(id, {
        params,
        startedAt: performance.now(),
        networkRequestStartedAt: null,
        startLoggedAt: null,
        loadedAt: null,
        suggestedAt: null,
        suggestionLoggedAt: null,
        acceptedAt: null,
    })

    return id
}

export function start(id: string): void {
    const event = displayedCompletions.get(id)
    if (event && !event.startLoggedAt) {
        event.startLoggedAt = performance.now()
        completionsStartedSinceLastSuggestion++
    }
}

export function networkRequestStarted(id: string, contextSummary: ContextSummary | undefined): void {
    const event = displayedCompletions.get(id)
    if (event && !event.networkRequestStartedAt) {
        event.networkRequestStartedAt = performance.now()
        event.params.contextSummary = contextSummary
    }
}

export function loaded(id: string): void {
    const event = displayedCompletions.get(id)
    if (!event) {
        return
    }

    if (!event.loadedAt) {
        event.loadedAt = performance.now()
    }
}

// Suggested completions will not be logged immediately. Instead, we log them when we either hide
// them again (they are NOT accepted) or when they ARE accepted. This way, we can calculate the
// duration they were actually visible for.
export function suggested(id: string, source: string, completion: InlineCompletionItem): void {
    const event = displayedCompletions.get(id)
    if (!event) {
        return
    }

    if (!event.suggestedAt) {
        const { lineCount, charCount } = lineAndCharCount(completion)
        event.params.source = source
        event.params.lineCount = lineCount
        event.params.charCount = charCount
        event.suggestedAt = performance.now()
    }
}

export function accept(id: string, completion: InlineCompletionItem): void {
    const completionEvent = displayedCompletions.get(id)
    if (!completionEvent || completionEvent.acceptedAt) {
        // Log a debug event, this case should not happen in production
        logCompletionEvent('acceptedUntrackedCompletion')
        return
    }

    // Some additional logging to ensure the invariant is correct. I expect these branches to never
    // hit but if they do, they might help debug analytics issues
    if (!completionEvent.loadedAt) {
        logCompletionEvent('unexpectedNotLoaded')
    }
    if (!completionEvent.startLoggedAt) {
        logCompletionEvent('unexpectedNotStarted')
    }
    if (!completionEvent.suggestedAt) {
        logCompletionEvent('unexpectedNotSuggested')
    }

    completionEvent.acceptedAt = performance.now()

    logSuggestionEvents()
    logCompletionEvent('accepted', {
        ...completionEvent.params,
        // We overwrite the existing lines and chars in the params and rely on the accepted one in
        // case the popover is used to insert a completion different from the one that was suggested
        ...lineAndCharCount(completion),
        otherCompletionProviderEnabled: otherCompletionProviderEnabled(),
    })
}

export function completionEvent(id: string): CompletionEvent | undefined {
    return displayedCompletions.get(id)
}

export function noResponse(id: string): void {
    const completionEvent = displayedCompletions.get(id)
    logCompletionEvent('noResponse', completionEvent?.params ?? {})
}

/**
 * This callback should be triggered whenever VS Code tries to highlight a new completion and it's
 * used to measure how long previous completions were visible.
 */
export function clear(): void {
    logSuggestionEvents()
}

function createId(): string {
    return Math.random().toString(36).slice(2, 11)
}

function logSuggestionEvents(): void {
    const now = performance.now()
    // eslint-disable-next-line ban/ban
    displayedCompletions.forEach(completionEvent => {
        const { loadedAt, suggestedAt, suggestionLoggedAt, startedAt, params, startLoggedAt, acceptedAt } =
            completionEvent

        // Only log suggestion events that were already shown to the user and
        // have not been logged yet.
        if (!loadedAt || !startLoggedAt || !suggestedAt || suggestionLoggedAt) {
            return
        }
        completionEvent.suggestionLoggedAt = now

        const latency = loadedAt - startedAt
        const displayDuration = now - suggestedAt
        const read = displayDuration >= READ_TIMEOUT
        const accepted = acceptedAt !== null

        logCompletionEvent('suggested', {
            ...params,
            latency,
            displayDuration,
            read: accepted || read,
            accepted,
            otherCompletionProviderEnabled: otherCompletionProviderEnabled(),
            completionsStartedSinceLastSuggestion,
        })
        completionsStartedSinceLastSuggestion = 0
    })

    // Completions are kept in the LRU cache for longer. This is because they
    // can still become visible if e.g. they are served from the cache and we
    // need to retain the ability to mark them as seen
}

const otherCompletionProviders = [
    'GitHub.copilot',
    'GitHub.copilot-nightly',
    'TabNine.tabnine-vscode',
    'TabNine.tabnine-vscode-self-hosted-updater',
    'AmazonWebServices.aws-toolkit-vscode', // Includes CodeWhisperer
    'Codeium.codeium',
    'Codeium.codeium-enterprise-updater',
    'CodeComplete.codecomplete-vscode',
    'Venthe.fauxpilot',
    'TabbyML.vscode-tabby',
]
function otherCompletionProviderEnabled(): boolean {
    return !!otherCompletionProviders.find(id => vscode.extensions.getExtension(id)?.isActive)
}

function lineAndCharCount({ insertText }: InlineCompletionItem): { lineCount: number; charCount: number } {
    const lineCount = insertText.split(/\r\n|\r|\n/).length
    const charCount = insertText.length
    return { lineCount, charCount }
}

/**
 * To avoid overflowing our analytics pipeline, errors are throttled and logged as a cumulative
 * count grouped by message every 10 minutes (with the first event being logged immediately so we
 * can detect new errors faster)
 *
 * To do this, the first time an error is encountered it will be immediately logged and stored in
 * the map with a count of `0`. Then for subsequent errors of the same type, the count is
 * incremented and logged periodically. The count is reset to `0` after each log interval.
 */
const TEN_MINUTES = 1000 * 60 * 10
const errorCounts: Map<string, number> = new Map()
export function logError(error: Error): void {
    if (isAbortError(error) || isRateLimitError(error)) {
        return
    }

    captureException(error)

    const message = error.message
    const traceId = isNetworkError(error) ? error.traceId : undefined

    if (!errorCounts.has(message)) {
        errorCounts.set(message, 0)
        logCompletionEvent('error', { message, traceId, count: 1 })
    }

    const count = errorCounts.get(message)!
    if (count === 0) {
        // Start a new flush interval
        setTimeout(() => {
            const count = errorCounts.get(message)!
            logCompletionEvent('error', { message, traceId, count })
            errorCounts.set(message, 0)
        }, TEN_MINUTES)
    }
    errorCounts.set(message, count + 1)
}
