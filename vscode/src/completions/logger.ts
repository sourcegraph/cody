import { LRUCache } from 'lru-cache'
import * as uuid from 'uuid'
import * as vscode from 'vscode'

import { isNetworkError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'
import { TelemetryEventProperties } from '@sourcegraph/cody-shared/src/telemetry'

import { getConfiguration } from '../configuration'
import { captureException, shouldErrorBeReported } from '../services/sentry/sentry'
import { telemetryService } from '../services/telemetry'

import { ContextSummary } from './context/context-mixer'
import { InlineCompletionsResultSource, TriggerKind } from './get-inline-completions'
import { PersistenceTracker } from './persistence-tracker'
import { RequestParams } from './request-manager'
import * as statistics from './statistics'
import { InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'
import { lines } from './text-processing/utils'
import { CompletionIntent } from './tree-sitter/query-sdk'
import { InlineCompletionItem } from './types'

// A completion ID is a unique identifier for a specific completion text displayed at a specific
// point in the document. A single completion can be suggested multiple times.
//
// Note: This ID is only used by our downstream services and should not be used by the clients.
export type CompletionAnalyticsID = string & { _opaque: typeof CompletionAnalyticsID }
declare const CompletionAnalyticsID: unique symbol

// A completion log ID is a unique identifier for a suggestion lifecycle (starting with the key
// stroke event) and used to sync all events and metrics related to that lifecycle.
export type CompletionLogID = string & { _opaque: typeof CompletionLogID }
declare const CompletionLogID: unique symbol

// A completion item ID is a unique identifier for an item that is part of the suggested candidates
// for a suggestion request.
export type CompletionItemID = string & { _opaque: typeof CompletionItemID }
declare const CompletionItemID: unique symbol

export interface CompletionEvent {
    id: CompletionLogID
    params: {
        id: CompletionAnalyticsID | null
        type: 'inline'
        multiline: boolean
        multilineMode: null | 'block'
        triggerKind: TriggerKind
        providerIdentifier: string
        providerModel: string
        languageId: string
        contextSummary?: any
        source?: InlineCompletionsResultSource
        lineCount?: number
        charCount?: number
        // Mapping to a higher level abstractions of syntax nodes (e.g., function declaration body)
        completionIntent?: CompletionIntent
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
    // Already logged partially accepted length
    loggedPartialAcceptedLength: number
}

export interface ItemPostProcessingInfo {
    // Number of ERROR nodes found in the completion insert text after pasting
    // it into the document and parsing this range with tree-sitter.
    parseErrorCount?: number
    // Number of lines truncated for multiline completions.
    lineTruncatedCount?: number
    // The truncation approach used.
    truncatedWith?: 'tree-sitter' | 'indentation'
    // Syntax node types extracted from the tree-sitter parse-tree without the completion pasted.
    nodeTypes?: {
        atCursor?: string
        parent?: string
        grandparent?: string
        greatGrandparent?: string
    }
    // Syntax node types extracted from the tree-sitter parse-tree with the completion pasted.
    nodeTypesWithCompletion?: {
        atCursor?: string
        parent?: string
        grandparent?: string
        greatGrandparent?: string
    }
}

interface CompletionItemInfo extends ItemPostProcessingInfo {
    lineCount: number
    charCount: number
    stopReason?: string
}

export const READ_TIMEOUT_MS = 750

// Maintain a cache of active suggestion requests
const activeSuggestionRequests = new LRUCache<CompletionLogID, CompletionEvent>({
    max: 20,
})

// Maintain a history of the last n displayed completions and their generated completion IDs. This
// allows us to reuse the completion ID across multiple suggestions.
const recentCompletions = new LRUCache<string, CompletionAnalyticsID>({
    max: 20,
})
function getRecentCompletionsKey(params: RequestParams, completion: string): string {
    return `${params.docContext.prefix}█${completion}█${params.docContext.nextNonEmptyLine}`
}

// On our analytics dashboards, we apply a distinct count on the completion ID to count unique
// completions as suggested. Since we don't have want to maintain a list of all completion IDs in
// the client, we instead retain the last few completion IDs that were marked as suggested to
// prevent local over counting.
const completionIdsMarkedAsSuggested = new LRUCache<CompletionAnalyticsID, true>({
    max: 50,
})

let persistenceTracker: PersistenceTracker | null = null

let completionsStartedSinceLastSuggestion = 0

export function logCompletionEvent(name: string, params?: TelemetryEventProperties): void {
    // TODO: Clean up this name mismatch when we move to TelemetryV2
    const prefix = isRunningInsideAgent() ? 'CodyAgent' : 'CodyVSCodeExtension'
    telemetryService.log(`${prefix}:completion:${name}`, params, { agent: true })
}

export function create(inputParams: Omit<CompletionEvent['params'], 'multilineMode' | 'type' | 'id'>): CompletionLogID {
    const id = uuid.v4() as CompletionLogID
    const params: CompletionEvent['params'] = {
        ...inputParams,
        type: 'inline',
        // @deprecated: We only keep the legacy name for backward compatibility in analytics
        multilineMode: inputParams.multiline ? 'block' : null,
        id: null,
    }

    activeSuggestionRequests.set(id, {
        id,
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
        loggedPartialAcceptedLength: 0,
    })

    return id
}

export function start(id: CompletionLogID): void {
    const event = activeSuggestionRequests.get(id)
    if (event && !event.startLoggedAt) {
        event.startLoggedAt = performance.now()
        completionsStartedSinceLastSuggestion++
    }
}

export function networkRequestStarted(id: CompletionLogID, contextSummary: ContextSummary | undefined): void {
    const event = activeSuggestionRequests.get(id)
    if (event && !event.networkRequestStartedAt) {
        event.networkRequestStartedAt = performance.now()
        event.params.contextSummary = contextSummary
    }
}

export function loaded(
    id: CompletionLogID,
    params: RequestParams,
    items: InlineCompletionItemWithAnalytics[],
    source: InlineCompletionsResultSource
): void {
    const event = activeSuggestionRequests.get(id)
    if (!event) {
        return
    }

    event.params.source = source

    // Check if we already have a completion id for the loaded completion item
    const key = items.length > 0 ? getRecentCompletionsKey(params, items[0].insertText) : ''
    const completionId: CompletionAnalyticsID = recentCompletions.get(key) ?? (uuid.v4() as CompletionAnalyticsID)
    recentCompletions.set(key, completionId)
    event.params.id = completionId

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
export function suggested(id: CompletionLogID, completion: InlineCompletionItemWithAnalytics): void {
    const event = activeSuggestionRequests.get(id)
    if (!event) {
        return
    }

    const completionId = event.params.id
    if (!completionId) {
        throw new Error('Completion ID not set, make sure to call loaded() first')
    }

    if (!event.suggestedAt) {
        const { lineCount, charCount } = lineAndCharCount(completion)

        event.params.lineCount = lineCount
        event.params.charCount = charCount
        event.suggestedAt = performance.now()

        setTimeout(() => {
            const event = activeSuggestionRequests.get(id)
            if (!event) {
                return
            }

            // We can assume that this completion will be marked as `read: true` because
            // READ_TIMEOUT_MS has passed without the completion being logged yet.
            if (event.suggestedAt && !event.suggestionAnalyticsLoggedAt && !event.suggestionLoggedAt) {
                if (completionIdsMarkedAsSuggested.has(completionId)) {
                    return
                }
                statistics.logSuggested()
                completionIdsMarkedAsSuggested.set(completionId, true)
                event.suggestionAnalyticsLoggedAt = performance.now()
            }
        }, READ_TIMEOUT_MS)
    }
}

export function accepted(
    id: CompletionLogID,
    document: vscode.TextDocument,
    completion: InlineCompletionItemWithAnalytics,
    trackedRange: vscode.Range | undefined
): void {
    const completionEvent = activeSuggestionRequests.get(id)
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

    if (!completionEvent.params.id) {
        throw new Error('Completion ID not set, make sure to call loaded() first')
    }

    // Ensure the CompletionID is never reused by removing it from the recent completions cache
    let key: string | null = null
    recentCompletions.forEach((v, k) => {
        if (v === completionEvent.params.id) {
            key = k
        }
    })

    if (key) {
        recentCompletions.delete(key)
    }

    completionEvent.acceptedAt = performance.now()

    logSuggestionEvents()
    logCompletionEvent('accepted', {
        ...getSharedParams(completionEvent),
        acceptedItem: { ...completionItemToItemInfo(completion) },
    })
    statistics.logAccepted()

    if (trackedRange === undefined || isRunningInsideAgent()) {
        return
    }
    if (persistenceTracker === null) {
        persistenceTracker = new PersistenceTracker()
    }
    persistenceTracker.track({
        id: completionEvent.params.id,
        insertedAt: Date.now(),
        insertText: completion.insertText,
        insertRange: trackedRange,
        document,
    })
}

export function partiallyAccept(
    id: CompletionLogID,
    completion: InlineCompletionItemWithAnalytics,
    acceptedLength: number
): void {
    const completionEvent = activeSuggestionRequests.get(id)
    // Only log partial acceptances if the completion was not yet fully accepted
    if (!completionEvent || completionEvent.acceptedAt) {
        return
    }

    const loggedPartialAcceptedLength = completionEvent.loggedPartialAcceptedLength

    // Do not log partial acceptances if the length of the accepted completion is not increasing
    if (acceptedLength <= loggedPartialAcceptedLength) {
        return
    }

    const acceptedLengthDelta = acceptedLength - loggedPartialAcceptedLength
    completionEvent.loggedPartialAcceptedLength = acceptedLength

    logCompletionEvent('partiallyAccepted', {
        ...getSharedParams(completionEvent),
        acceptedItem: { ...completionItemToItemInfo(completion) },
        acceptedLength,
        acceptedLengthDelta,
    })
}

/** @deprecated */
export function getCompletionEvent(id: CompletionLogID): CompletionEvent | undefined {
    return activeSuggestionRequests.get(id)
}

export function noResponse(id: CompletionLogID): void {
    const completionEvent = activeSuggestionRequests.get(id)
    logCompletionEvent('noResponse', completionEvent?.params ?? {})
}

/**
 * This callback should be triggered whenever VS Code tries to highlight a new completion and it's
 * used to measure how long previous completions were visible.
 */
export function flushActiveSuggestionRequests(): void {
    logSuggestionEvents()
}

function logSuggestionEvents(): void {
    const now = performance.now()
    activeSuggestionRequests.forEach(completionEvent => {
        const {
            params,
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
        if (!loadedAt || !startLoggedAt || !suggestedAt || suggestionLoggedAt || !params.id) {
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
            if (read && !completionIdsMarkedAsSuggested.has(params.id)) {
                statistics.logSuggested()
                completionIdsMarkedAsSuggested.set(params.id, true)
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

// Restores the logger's internals to a pristine state§
export function reset_testOnly(): void {
    activeSuggestionRequests.clear()
    completionIdsMarkedAsSuggested.clear()
    recentCompletions.clear()
    completionsStartedSinceLastSuggestion = 0
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
    const otherCompletionProviders = getOtherCompletionProvider()
    return {
        ...event.params,
        items: event.items.map(i => ({ ...i })),
        otherCompletionProviderEnabled: otherCompletionProviders.length > 0,
        otherCompletionProviders,
    }
}

function completionItemToItemInfo(item: InlineCompletionItemWithAnalytics): CompletionItemInfo {
    const { lineCount, charCount } = lineAndCharCount(item)

    return {
        lineCount,
        charCount,
        stopReason: item.stopReason,
        parseErrorCount: item.parseErrorCount,
        lineTruncatedCount: item.lineTruncatedCount,
        truncatedWith: item.truncatedWith,
        nodeTypes: item.nodeTypes,
        nodeTypesWithCompletion: item.nodeTypesWithCompletion,
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
    'blackboxapp.blackbox',
    'devsense.intelli-php-vscode',
    'aminer.codegeex',
    'svipas.code-autocomplete',
    'mutable-ai.mutable-ai',
]
function getOtherCompletionProvider(): string[] {
    return otherCompletionProviders.filter(id => vscode.extensions.getExtension(id)?.isActive)
}

function isRunningInsideAgent(): boolean {
    const config = getConfiguration(vscode.workspace.getConfiguration())
    return !!config.isRunningInsideAgent
}
