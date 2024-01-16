import { LRUCache } from 'lru-cache'
import * as uuid from 'uuid'
import * as vscode from 'vscode'

import { isNetworkError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'
import { type BillingCategory, type BillingProduct } from '@sourcegraph/cody-shared/src/telemetry-v2'
import { type KnownString, type TelemetryEventParameters } from '@sourcegraph/telemetry'

import { getConfiguration } from '../configuration'
import { captureException, shouldErrorBeReported } from '../services/sentry/sentry'
import { getExtensionDetails, logPrefix, telemetryService } from '../services/telemetry'
import { splitSafeMetadata, telemetryRecorder } from '../services/telemetry-v2'
import { type CompletionIntent } from '../tree-sitter/query-sdk'

import { type ContextSummary } from './context/context-mixer'
import { type InlineCompletionsResultSource, type TriggerKind } from './get-inline-completions'
import { PersistenceTracker } from './persistence-tracker'
import { type RequestParams } from './request-manager'
import * as statistics from './statistics'
import { type InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'
import { lines } from './text-processing/utils'
import { type InlineCompletionItem } from './types'

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

interface InteractionIDPayload {
    /**
     * An ID to uniquely identify a suggest completion. Note: It is possible for this ID to be part
     * of two suggested events. This happens when the exact same completion text is shown again at
     * the exact same location. We count this as the same completion and thus use the same ID.
     */
    id: CompletionAnalyticsID | null
}

interface SharedEventPayload extends InteractionIDPayload {
    /** Eventual Sourcegraph instance OpenTelemetry trace id */
    traceId?: string

    /** Wether the completion is a singleline or multiline one. */
    multiline: boolean

    /**
     * `null` means singleline, `block` means multiline.
     * @deprecated Use `multiline` instead.
     */
    multilineMode: null | 'block'

    /** Describes how the autocomplete request was triggered by the user. */
    triggerKind: TriggerKind

    /** Information about what provider is used. e.g. `anthropic` or `fireworks`. */
    providerIdentifier: string

    /** Information about which model was used. e.g. `starcoder-7b` or `claude-instant`. */
    providerModel: string

    /** Language of the document being completed. */
    languageId: string

    /**
     * Information about the context retrieval process that lead to this autocomplete request. Refer
     * to the documentation of {@link ContextSummary}
     */
    contextSummary?: ContextSummary

    /**
     * Information about the source of the completion (i.e wether it was fetched from network or
     * from a cache).
     */
    source?: InlineCompletionsResultSource

    /** Eventual artificial delay that was used to throttle unwanted completions. */
    artificialDelay?: number

    /**
     * Mapping the completion intent to a higher level abstractions of syntax nodes (e.g. function
     * declaration body)
     */
    completionIntent?: CompletionIntent

    /** Information about the suggested items returned as part of this completions */
    items: CompletionItemInfo[]

    /** If true, another completion provider extension is enabled and the result might be poised */
    otherCompletionProviderEnabled: boolean

    /** A list of known completion providers that are also enabled with this user. */
    otherCompletionProviders: string[]
}

/**
 * hasInteractionID helps extracting analytics interaction ID from parameters
 * that extend SharedEventPayload.
 */
function hasInteractionID(params: any): params is InteractionIDPayload {
    return 'id' in params
}

/** Emitted when a completion was suggested to the user and printed onto the screen */
interface SuggestedEventPayload extends SharedEventPayload {
    latency: number
    displayDuration: number
    read: boolean
    accepted: boolean
    completionsStartedSinceLastSuggestion: number
}

/** Emitted when a completion was fully accepted by the user */
interface AcceptedEventPayload extends SharedEventPayload {
    /**
     * Information about which item of the suggested items list was being accepted.
     *
     * Note: Fields like `acceptedItem.charCount` might differ from the `items[n].charCount` based
     * on the current document state when the completion was inserted.
     */
    acceptedItem: CompletionItemInfo
}

/** Emitted when a completion was partially accepted by the user */
interface PartiallyAcceptedEventPayload extends SharedEventPayload {
    /**
     * Information about which item of the suggested items list was being accepted.
     *
     * Note: Fields like `acceptedItem.charCount` might differ from the `items[n].charCount` based
     * on the current document state when the completion was inserted.
     */
    acceptedItem: CompletionItemInfo
    /** The number of character that were already accepted of the given acceptedItem _in total_. */
    acceptedLength: number
    /**
     * The number of characters that were accepted as part of this partially accepted event (so
     * if you sum up all the acceptedLengthDelta of a given completion ID, you get acceptedLength.
     */
    acceptedLengthDelta: number
}

/** Emitted when a completion is still present at a specific time interval after insertion */
interface PersistencePresentEventPayload {
    /** An ID to uniquely identify an accepted completion. */
    id: CompletionAnalyticsID
    /** How many seconds after the acceptance was the check performed */
    afterSec: number
    /** Levenshtein distance between the current document state and the accepted completion */
    difference: number
    /** Number of lines still in the document */
    lineCount: number
    /** Number of characters still in the document */
    charCount: number
}

/** Emitted when a completion is no longer present at a specific time interval after insertion */
interface PersistenceRemovedEventPayload {
    /** An ID to uniquely identify an accepted completion. */
    id: CompletionAnalyticsID
}

/** Emitted when a completion request returned no usable results */
interface NoResponseEventPayload extends SharedEventPayload {}

/** Emitted when a completion request failed */
interface ErrorEventPayload {
    /** The error message */
    message: string
    /** Eventual Sourcegraph instance traceId */
    traceId?: string
    /** How often the error occurred (added to enable batching) */
    count: number
}

/** Emitted when a completion is formatted on accept */
interface FormatEventPayload {
    // `formatCompletion` duration.
    duration: number
    // Current document langauge ID
    languageId: string
    // Formatter name extracted from user settings JSON.
    formatter?: string
}

function logCompletionSuggestedEvent(params: SuggestedEventPayload): void {
    // Use automatic splitting for now - make this manual as needed
    const { metadata, privateMetadata } = splitSafeMetadata(params)
    writeCompletionEvent(
        'suggested',
        {
            version: 0,
            metadata,
            privateMetadata,
        },
        params
    )
}
function logCompletionAcceptedEvent(params: AcceptedEventPayload): void {
    // Use automatic splitting for now - make this manual as needed
    const { metadata, privateMetadata } = splitSafeMetadata(params)
    writeCompletionEvent(
        'accepted',
        {
            version: 0,
            metadata,
            privateMetadata,
        },
        params
    )
}
function logCompletionPartiallyAcceptedEvent(params: PartiallyAcceptedEventPayload): void {
    // Use automatic splitting for now - make this manual as needed
    const { metadata, privateMetadata } = splitSafeMetadata(params)
    writeCompletionEvent(
        'partiallyAccepted',
        {
            version: 0,
            metadata,
            privateMetadata,
        },
        params
    )
}
export function logCompletionPersistencePresentEvent(params: PersistencePresentEventPayload): void {
    // Use automatic splitting for now - make this manual as needed
    const { metadata, privateMetadata } = splitSafeMetadata(params)
    writeCompletionEvent(
        'persistence:present',
        {
            version: 0,
            metadata,
            privateMetadata,
        },
        params
    )
}
export function logCompletionPersistenceRemovedEvent(params: PersistenceRemovedEventPayload): void {
    // Use automatic splitting for now - make this manual as needed
    const { metadata, privateMetadata } = splitSafeMetadata(params)
    writeCompletionEvent(
        'persistence:removed',
        {
            version: 0,
            metadata,
            privateMetadata,
        },
        params
    )
}
function logCompletionNoResponseEvent(params: NoResponseEventPayload): void {
    // Use automatic splitting for now - make this manual as needed
    const { metadata, privateMetadata } = splitSafeMetadata(params)
    writeCompletionEvent('noResponse', { version: 0, metadata, privateMetadata }, params)
}
function logCompletionErrorEvent(params: ErrorEventPayload): void {
    // Use automatic splitting for now - make this manual as needed
    const { metadata, privateMetadata } = splitSafeMetadata(params)
    writeCompletionEvent('error', { version: 0, metadata, privateMetadata }, params)
}
export function logCompletionFormatEvent(params: FormatEventPayload): void {
    // Use automatic splitting for now - make this manual as needed
    const { metadata, privateMetadata } = splitSafeMetadata(params)
    writeCompletionEvent('format', { version: 0, metadata, privateMetadata }, params)
}
/**
 * The following events are added to ensure the logging bookkeeping works as expected in production
 * and should not happen under normal circumstances.
 */
export function logCompletionBookkeepingEvent(
    name:
        | 'acceptedUntrackedCompletion'
        | 'unexpectedNotLoaded'
        | 'unexpectedNotStarted'
        | 'unexpectedNotSuggested'
        | 'unexpectedAlreadySuggested'
        | 'containsOpeningTag'
        | 'synthesizedFromParallelRequest'
): void {
    writeCompletionEvent(name)
}

/**
 * writeCompletionEvent is the underlying helper for various logCompletion*
 * functions. It writes telemetry in the appropriate format to both the v1
 * and v2 telemetry.
 */
function writeCompletionEvent<Name extends string, LegacyParams extends {}>(
    name: KnownString<Name>,
    params?: TelemetryEventParameters<{ [key: string]: number }, BillingProduct, BillingCategory>,
    /**
     * legacyParams are passed through as-is the legacy event logger for backwards
     * compatibility. All relevant arguments should also be set on the params
     * object.
     */
    legacyParams?: LegacyParams
): void {
    const extDetails = getExtensionDetails(getConfiguration(vscode.workspace.getConfiguration()))
    telemetryService.log(`${logPrefix(extDetails.ide)}:completion:${name}`, legacyParams, {
        agent: true,
        hasV2Event: true, // this helper translates the event for us
    })
    /**
     * Extract interaction ID from the full legacy params for convenience
     */
    if (params && hasInteractionID(legacyParams)) {
        params.interactionID = legacyParams.id?.toString()
    }
    /**
     * New telemetry automatically adds extension context - we do not need to
     * include platform in the name of the event. However, we MUST prefix the
     * event with 'cody.' to have the event be categorized as a Cody event.
     */
    telemetryRecorder.recordEvent('cody.completion', name, params)
}

export interface CompletionBookkeepingEvent {
    id: CompletionLogID
    params: Omit<SharedEventPayload, 'items' | 'otherCompletionProviderEnabled' | 'otherCompletionProviders'>
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
        lastAncestorOnTheSameLine?: string
    }
    // Syntax node types extracted from the tree-sitter parse-tree with the completion pasted.
    nodeTypesWithCompletion?: {
        atCursor?: string
        parent?: string
        grandparent?: string
        greatGrandparent?: string
        lastAncestorOnTheSameLine?: string
    }
}

export interface CompletionItemInfo extends ItemPostProcessingInfo {
    lineCount: number
    charCount: number
    // 🚨 SECURITY: included only for DotCom users.
    insertText?: string
    stopReason?: string
}

const READ_TIMEOUT_MS = 750

// Maintain a cache of active suggestion requests
const activeSuggestionRequests = new LRUCache<CompletionLogID, CompletionBookkeepingEvent>({
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

export function create(
    inputParams: Omit<CompletionBookkeepingEvent['params'], 'multilineMode' | 'type' | 'id'>
): CompletionLogID {
    const id = uuid.v4() as CompletionLogID
    const params: CompletionBookkeepingEvent['params'] = {
        ...inputParams,
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
    source: InlineCompletionsResultSource,
    isDotComUser: boolean
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
        event.items = items.map(item => completionItemToItemInfo(item, isDotComUser))
    }
}

// Suggested completions will not be logged immediately. Instead, we log them when we either hide
// them again (they are NOT accepted) or when they ARE accepted. This way, we can calculate the
// duration they were actually visible for.
//
// For statistics logging we start a timeout matching the READ_TIMEOUT_MS so we can increment the
// suggested completion count as soon as we count it as such.
export function suggested(id: CompletionLogID): void {
    const event = activeSuggestionRequests.get(id)
    if (!event) {
        return
    }

    const completionId = event.params.id
    if (!completionId) {
        throw new Error('Completion ID not set, make sure to call loaded() first')
    }

    if (!event.suggestedAt) {
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
    trackedRange: vscode.Range | undefined,
    isDotComUser: boolean
): void {
    const completionEvent = activeSuggestionRequests.get(id)
    if (!completionEvent || completionEvent.acceptedAt) {
        // Log a debug event, this case should not happen in production
        logCompletionBookkeepingEvent('acceptedUntrackedCompletion')
        return
    }

    // Some additional logging to ensure the invariant is correct. I expect these branches to never
    // hit but if they do, they might help debug analytics issues
    if (!completionEvent.loadedAt) {
        logCompletionBookkeepingEvent('unexpectedNotLoaded')
    }
    if (!completionEvent.startLoggedAt) {
        logCompletionBookkeepingEvent('unexpectedNotStarted')
    }
    if (!completionEvent.suggestedAt) {
        logCompletionBookkeepingEvent('unexpectedNotSuggested')
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
        logCompletionBookkeepingEvent('unexpectedAlreadySuggested')
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
    logCompletionAcceptedEvent({
        ...getSharedParams(completionEvent),
        acceptedItem: completionItemToItemInfo(completion, isDotComUser),
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
    acceptedLength: number,
    isDotComUser: boolean
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

    logCompletionPartiallyAcceptedEvent({
        ...getSharedParams(completionEvent),
        acceptedItem: completionItemToItemInfo(completion, isDotComUser),
        acceptedLength,
        acceptedLengthDelta,
    })
}

/** @deprecated */
export function getCompletionEvent(id: CompletionLogID): CompletionBookkeepingEvent | undefined {
    return activeSuggestionRequests.get(id)
}

export function noResponse(id: CompletionLogID): void {
    const completionEvent = activeSuggestionRequests.get(id)
    if (!completionEvent) {
        return
    }
    logCompletionNoResponseEvent(getSharedParams(completionEvent))
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

        logCompletionSuggestedEvent({
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
        logCompletionErrorEvent({ message, traceId, count: 1 })
    }

    const count = errorCounts.get(message)!
    if (count === 0) {
        // Start a new flush interval
        setTimeout(() => {
            const count = errorCounts.get(message)!
            logCompletionErrorEvent({ message, traceId, count })
            errorCounts.set(message, 0)
        }, TEN_MINUTES)
    }
    errorCounts.set(message, count + 1)
}

function getSharedParams(event: CompletionBookkeepingEvent): SharedEventPayload {
    const otherCompletionProviders = getOtherCompletionProvider()
    return {
        ...event.params,
        items: event.items.map(i => ({ ...i })),
        otherCompletionProviderEnabled: otherCompletionProviders.length > 0,
        otherCompletionProviders,
    }
}

function completionItemToItemInfo(item: InlineCompletionItemWithAnalytics, isDotComUser: boolean): CompletionItemInfo {
    const { lineCount, charCount } = lineAndCharCount(item)

    const completionItemInfo: CompletionItemInfo = {
        lineCount,
        charCount,
        stopReason: item.stopReason,
        parseErrorCount: item.parseErrorCount,
        lineTruncatedCount: item.lineTruncatedCount,
        truncatedWith: item.truncatedWith,
        nodeTypes: item.nodeTypes,
        nodeTypesWithCompletion: item.nodeTypesWithCompletion,
    }

    // Do not log long insert text.
    // 200 is a char_count limit based on the 98 percentile from the last 14 days.
    if (isDotComUser && charCount < 200) {
        // 🚨 SECURITY: included only for DotCom users.
        completionItemInfo.insertText = item.insertText
    }

    return completionItemInfo
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
