import { LRUCache } from 'lru-cache'
import * as uuid from 'uuid'
import * as vscode from 'vscode'

import { isNetworkError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'
import { TelemetryEventProperties } from '@sourcegraph/cody-shared/src/telemetry'

import { captureException, shouldErrorBeReported } from '../services/sentry/sentry'
import { telemetryService } from '../services/telemetry'

import { ContextSummary } from './context/context'
import { InlineCompletionsResultSource } from './get-inline-completions'
import * as statistics from './statistics'
import { InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'
import { lines } from './text-processing/utils'
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
        source?: InlineCompletionsResultSource
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
    // The timestamp of when the suggestion was logged to our statistics backend
    // This can happen before we log it to our analytics backend because we
    // don't care about the total display duration but instead want to update
    // the UI as soon as the completion is counted as visible
    suggestionAnalyticsLoggedAt: number | null
    // The timestamp of when a completion was accepted and logged to our backend
    acceptedAt: number | null
    // Information about each completion item received per one completion event
    items: CompletionItemInfo[]
}

export interface ItemPostProcesssingInfo {
    // Number of ERROR nodes found in the completion insert text after pasting
    // it into the document and parsing this range with tree-sitter.
    parseErrorCount?: number
    // Number of lines truncated for multiline completions.
    lineTruncatedCount?: number
    // The truncation approach used.
    truncatedWith?: 'tree-sitter' | 'indentation'
    // Syntax node types extracted from the tree-sitter parse-tree.
    nodeTypes?: {
        atCursor?: string
        parent?: string
        grandparent?: string
        greatGrandparent?: string
    }
}

interface CompletionItemInfo extends ItemPostProcesssingInfo {
    lineCount: number
    charCount: number
}

const READ_TIMEOUT_MS = 750

const displayedCompletions = new LRUCache<string, CompletionEvent>({
    max: 100, // Maximum number of completions that we are keeping track of
})

let completionsStartedSinceLastSuggestion = 0

export function logCompletionEvent(name: string, params?: TelemetryEventProperties): void {
    telemetryService.log(`CodyVSCodeExtension:completion:${name}`, params)
}

export function create(inputParams: Omit<CompletionEvent['params'], 'multilineMode' | 'type' | 'id'>): string {
    const id = uuid.v4()
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
        suggestionAnalyticsLoggedAt: null,
        acceptedAt: null,
        items: [],
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

export function loaded(id: string, items: InlineCompletionItemWithAnalytics[]): void {
    const event = displayedCompletions.get(id)
    if (!event) {
        return
    }

    if (!event.loadedAt) {
        event.loadedAt = performance.now()
    }

    if (event.items.length === 0) {
        event.items = items.map(completionItemToItemInfo)
    }
}

// Suggested completions will not be logged immediately. Instead, we log them when we either hide
// them again (they are NOT accepted) or when they ARE accepted. This way, we can calculate the
// duration they were actually visible for.
//
// For statistics logging we start a timeout matching the READ_TIMEOUT_MS so we can increment the
// suggested completion count as soon as we count it as such.
export function suggested(id: string, source: InlineCompletionsResultSource, completion: InlineCompletionItem): void {
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

        setTimeout(() => {
            const event = displayedCompletions.get(id)
            if (!event) {
                return
            }

            if (event.suggestedAt && !event.suggestionAnalyticsLoggedAt && !event.suggestionLoggedAt) {
                // We can assume that this completion will be marked as `read: true` because
                // READ_TIMEOUT_MS has passed without the completion being logged yet.
                statistics.logSuggested()
                event.suggestionAnalyticsLoggedAt = performance.now()
            }
        }, READ_TIMEOUT_MS)
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
    // It is still possible to accept a completion before it was logged as suggested. This is
    // because we do not have direct access to know when a completion is being shown or hidden from
    // VS Code. Instead, we rely on subsequent completion callbacks and other heuristics to know
    // when the current one is rejected.
    //
    // One such condition is when using backspace. In VS Code, we create completions such that they
    // always start at the binning of the line. This means when backspacing past the initial trigger
    // point, we keep showing the currently rendered completion until the next request is finished.
    // However, we do log the completion as rejected with the keystroke leaving a small window where
    // the completion can be accepted after it was marked as suggested.
    if (completionEvent.suggestionLoggedAt) {
        logCompletionEvent('unexpectedAlreadySuggested')
    }

    completionEvent.acceptedAt = performance.now()

    logSuggestionEvents()
    logCompletionEvent('accepted', {
        ...getSharedParams(completionEvent),
        acceptedItem: { ...completionItemToItemInfo(completion) },
    })
    statistics.logAccepted()
}

export function getCompletionEvent(id: string): CompletionEvent | undefined {
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

function logSuggestionEvents(): void {
    const now = performance.now()
    // eslint-disable-next-line ban/ban
    displayedCompletions.forEach(completionEvent => {
        const {
            loadedAt,
            suggestedAt,
            suggestionLoggedAt,
            startedAt,
            startLoggedAt,
            acceptedAt,
            suggestionAnalyticsLoggedAt,
        } = completionEvent

        // Only log suggestion events that were already shown to the user and
        // have not been logged yet.
        if (!loadedAt || !startLoggedAt || !suggestedAt || suggestionLoggedAt) {
            return
        }
        completionEvent.suggestionLoggedAt = now

        const latency = loadedAt - startedAt
        const displayDuration = now - suggestedAt
        const seen = displayDuration >= READ_TIMEOUT_MS
        const accepted = acceptedAt !== null
        const read = accepted || seen

        if (!suggestionAnalyticsLoggedAt) {
            completionEvent.suggestionAnalyticsLoggedAt = now
            if (read) {
                statistics.logSuggested()
            }
        }

        logCompletionEvent('suggested', {
            ...getSharedParams(completionEvent),
            latency,
            displayDuration,
            read,
            accepted,
            completionsStartedSinceLastSuggestion,
        })

        completionsStartedSinceLastSuggestion = 0
    })

    // Completions are kept in the LRU cache for longer. This is because they
    // can still become visible if e.g. they are served from the cache and we
    // need to retain the ability to mark them as seen
}

function lineAndCharCount({ insertText }: InlineCompletionItem): { lineCount: number; charCount: number } {
    const lineCount = lines(insertText).length
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
    if (!shouldErrorBeReported(error)) {
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

function getSharedParams(event: CompletionEvent): TelemetryEventProperties {
    return {
        ...event.params,
        items: event.items.map(i => ({ ...i })),
        otherCompletionProviderEnabled: otherCompletionProviderEnabled(),
    }
}

function completionItemToItemInfo(item: InlineCompletionItemWithAnalytics): CompletionItemInfo {
    const { lineCount, charCount } = lineAndCharCount(item)

    return {
        lineCount,
        charCount,
        parseErrorCount: item.parseErrorCount,
        lineTruncatedCount: item.lineTruncatedCount,
        truncatedWith: item.truncatedWith,
        nodeTypes: item.nodeTypes,
    }
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
