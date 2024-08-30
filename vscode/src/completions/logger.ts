import { LRUCache } from 'lru-cache'
import * as uuid from 'uuid'
import * as vscode from 'vscode'

import {
    type AutocompleteContextSnippet,
    type BillingCategory,
    type BillingProduct,
    FeatureFlag,
    isNetworkError,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import type { KnownString, TelemetryEventParameters } from '@sourcegraph/telemetry'

import { captureException, shouldErrorBeReported } from '../services/sentry/sentry'
import { splitSafeMetadata } from '../services/telemetry-v2'

import { type Span, trace } from '@opentelemetry/api'
import { PersistenceTracker } from '../common/persistence-tracker'
import type {
    PersistencePresentEventPayload,
    PersistenceRemovedEventPayload,
} from '../common/persistence-tracker/types'
import { GitHubDotComRepoMetadata } from '../repository/repo-metadata-from-git-api'
import { upstreamHealthProvider } from '../services/UpstreamHealthProvider'
import {
    AUTOCOMPLETE_STAGE_COUNTER_INITIAL_STATE,
    type AutocompletePipelineCountedStage,
    autocompleteStageCounterLogger,
} from '../services/autocomplete-stage-counter-logger'
import { type CompletionIntent, CompletionIntentTelemetryMetadataMapping } from '../tree-sitter/queries'
import { completionProviderConfig } from './completion-provider-config'
import type { ContextSummary } from './context/context-mixer'
import {
    InlineCompletionsResultSource,
    InlineCompletionsResultSourceTelemetryMetadataMapping,
    TriggerKind,
    TriggerKindTelemetryMetadataMapping,
} from './get-inline-completions'
import type { RequestParams } from './request-manager'
import * as statistics from './statistics'
import type {
    InlineCompletionItemWithAnalytics,
    InlineCompletionResponseHeaders,
} from './text-processing/process-inline-completions'
import { lines } from './text-processing/utils'
import type { InlineCompletionItem } from './types'

// A completion ID is a unique identifier for a specific completion text displayed at a specific
// point in the document. A single completion can be suggested multiple times.
//
// Note: This ID is only used by our downstream services and should not be used by the clients.
type CompletionAnalyticsID = string & { _opaque: typeof CompletionAnalyticsID }
declare const CompletionAnalyticsID: unique symbol

// A completion log ID is a unique identifier for a suggestion lifecycle (starting with the key
// stroke event) and used to sync all events and metrics related to that lifecycle.
export type CompletionLogID = string & { _opaque: typeof CompletionLogID }
declare const CompletionLogID: unique symbol

// A completion item ID is a unique identifier for an item that is part of the suggested candidates
// for a suggestion request.
export type CompletionItemID = string & { _opaque: typeof CompletionItemID }
declare const CompletionItemID: unique symbol

interface InlineCompletionItemRetrievedContext {
    content: string
    filePath: string
    startLine: number
    endLine: number
}

interface InlineContextItemsParams {
    context: AutocompleteContextSnippet[]
    filePath: string | undefined
    gitUrl: string | undefined
    commit: string | undefined
}

interface InlineCompletionItemContext {
    gitUrl: string
    commit?: string
    filePath?: string
    prefix?: string
    suffix?: string
    triggerLine?: number
    triggerCharacter?: number
    context?: InlineCompletionItemRetrievedContext[]
}

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

    /** Information about what inference provider is used. e.g. `anthropic` or `fireworks`. */
    providerIdentifier: string

    /**
     * Model used by Cody client to request the completion. e.g. `starcoder-7b` or `claude-instant`.
     * Controls completion request parameters such as prompt template, stop sequences, context size, etc.
     */
    providerModel: string

    /**
     * Model used by Cody Gateway to make the inference. e.g. `fireworks/accounts/sourcegraph/models/starcoder-7b-w8a16`
     * This is a fully unique identifier of the model used to route a request to the inference provider.
     * It can include model version, quantization, inference account, and other details not exposed
     * on the client side (`providerModel`).
     *
     * This model can be completely different from the `providerModel` based on the Cody Gateway configuration.
     * For example, CG can re-route requests to a different model based on the inference provider load.
     */
    resolvedModel?: string

    /**
     * A subset of HTTP response headers returned by the completion provider.
     */
    responseHeaders?: InlineCompletionResponseHeaders

    /**
     * Duration in ms for events that are part of the autocomplete generation pipeline.
     */
    stageTimings: Partial<Record<AutocompletePipelineStage, number>>

    /** Language of the document being completed. */
    languageId: string

    /** If we're inside a test file */
    testFile: boolean

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

    /**
     * True if a completion was fuzzy-matched by the request manager cache.
     */
    isFuzzyMatch?: boolean

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

    /** The round trip timings to reach the Sourcegraph and Cody Gateway instances. */
    upstreamLatency?: number
    gatewayLatency?: number

    /** Inline Context items used by LLM to get the completions */
    // 🚨 SECURITY: included log for DotCom users.
    inlineCompletionItemContext?: InlineCompletionItemContext
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

function logCompletionSuggestedEvent(
    isDotComUser: boolean,
    inlineCompletionItemContext: InlineCompletionItemContext | undefined,
    params: SuggestedEventPayload
): void {
    // Use automatic splitting for now - make this manual as needed
    const { metadata, privateMetadata } = splitSafeMetadata({
        ...params,
        inlineCompletionItemContext,
    })
    writeCompletionEvent(
        null,
        'suggested',
        {
            version: 0,
            metadata: {
                ...metadata,
                recordsPrivateMetadataTranscript:
                    isDotComUser && inlineCompletionItemContext !== undefined ? 1 : 0,
            },
            privateMetadata,
        },
        params
    )
}
function logCompletionAcceptedEvent(params: AcceptedEventPayload): void {
    // Use automatic splitting for now - make this manual as needed
    const { metadata, privateMetadata } = splitSafeMetadata(params)
    writeCompletionEvent(
        null,
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
        null,
        'partiallyAccepted',
        {
            version: 0,
            metadata,
            privateMetadata,
        },
        params
    )
}
function logCompletionPersistencePresentEvent(params: PersistencePresentEventPayload): void {
    // Use automatic splitting for now - make this manual as needed
    const { metadata, privateMetadata } = splitSafeMetadata(params)
    writeCompletionEvent(
        'persistence',
        'present',
        {
            version: 0,
            metadata,
            privateMetadata,
        },
        params
    )
}
function logCompletionPersistenceRemovedEvent(params: PersistenceRemovedEventPayload): void {
    // Use automatic splitting for now - make this manual as needed
    const { metadata, privateMetadata } = splitSafeMetadata(params)
    writeCompletionEvent(
        'persistence',
        'removed',
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
    writeCompletionEvent(null, 'noResponse', { version: 0, metadata, privateMetadata }, params)
}
function logCompletionErrorEvent(params: ErrorEventPayload): void {
    // Use automatic splitting for now - make this manual as needed
    const { metadata, privateMetadata } = splitSafeMetadata(params)
    writeCompletionEvent(null, 'error', { version: 0, metadata, privateMetadata }, params)
}
export function logCompletionFormatEvent(params: FormatEventPayload): void {
    // Use automatic splitting for now - make this manual as needed
    const { metadata, privateMetadata } = splitSafeMetadata(params)
    writeCompletionEvent(null, 'format', { version: 0, metadata, privateMetadata }, params)
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
    writeCompletionEvent(null, name)
}

/**
 * writeCompletionEvent is the underlying helper for various logCompletion*
 * functions. It writes telemetry in the appropriate format to both the v1
 * and v2 telemetry.
 *
 * @param subfeature Subfeature can optionally be provided to be added as part of the event feature.
 * e.g. 'cody.completion.subfeature'. DO NOT include a 'cody.*' prefix.
 *  MUST start with lower case and ONLY have letters and '.'.
 * @param action action is required to represent the verb associated with an event occurrence.
 * e.g. 'executed', MUST start with lower case and ONLY have letters and '.'.
 * @param params Telemetry V2 parameters
 * @param legacyParam legacyParams are passed through as-is the legacy event logger for backwards
 * compatibility. All relevant arguments should also be set on the params
 * object.
 */
function writeCompletionEvent<SubFeature extends string, Action extends string, LegacyParams extends {}>(
    subfeature: KnownString<SubFeature> | null,
    action: KnownString<Action>,
    params?: TelemetryEventParameters<{ [key: string]: number }, BillingProduct, BillingCategory>,
    legacyParams?: LegacyParams
): void {
    /**
     * Extract interaction ID from the full legacy params for convenience
     */
    if (params && hasInteractionID(legacyParams)) {
        params.interactionID = legacyParams.id?.toString()
    }
    /**
     * Helper function to convert privateMetadata string values to numerical based on 'telemetryMetadataMapping...' lookup. Enables data collection on `metadata`
     */
    function mapEnumToMetadata<
        V extends Record<string, string>,
        // Do not allow number keys in `telemetryMetadataMapping`
        K extends keyof V extends string ? string : never,
    >(
        value: string | undefined,
        valueEnum: V,
        metadataMapping: Record<V[K], number>
    ): number | undefined {
        if (value === undefined) return undefined
        const enumKey = Object.keys(valueEnum).find(key => valueEnum[key] === value)
        if (!enumKey) return undefined
        const mappingValue = metadataMapping[enumKey as V[K]]
        return typeof mappingValue === 'number' ? mappingValue : undefined
    }

    if (params?.metadata) {
        const mappedTriggerKind = mapEnumToMetadata(
            params.privateMetadata?.triggerKind,
            TriggerKind,
            TriggerKindTelemetryMetadataMapping
        )

        if (mappedTriggerKind !== undefined) {
            params.metadata.triggerKind = mappedTriggerKind
        }

        const mappedSource = mapEnumToMetadata(
            params.privateMetadata?.source,
            InlineCompletionsResultSource,
            InlineCompletionsResultSourceTelemetryMetadataMapping
        )
        if (mappedSource !== undefined) {
            params.metadata.source = mappedSource
        }

        // for each completionsProviders, add it to metadata showing it's enabled
        if (params.privateMetadata?.otherCompletionProviders) {
            for (const key of params.privateMetadata.otherCompletionProviders) {
                params.metadata[`otherCompletionProviders.${key}`] = 1
            }
        }

        // Need to convert since CompletionIntent only refers to a type
        const CompletionIntentEnum: Record<CompletionIntent, CompletionIntent> = Object.keys(
            CompletionIntentTelemetryMetadataMapping
        ).reduce(
            (acc, key) => {
                acc[key as CompletionIntent] = key as CompletionIntent
                return acc
            },
            {} as Record<CompletionIntent, CompletionIntent>
        )

        const mappedCompletionIntent = mapEnumToMetadata(
            params.privateMetadata?.completionIntent,
            CompletionIntentEnum,
            CompletionIntentTelemetryMetadataMapping
        )
        if (mappedCompletionIntent !== undefined) {
            params.metadata.completionIntent = mappedCompletionIntent
        }
    }

    /**
     * New telemetry automatically adds extension context - we do not need to
     * include platform in the name of the event. However, we MUST prefix the
     * event with 'cody.' to have the event be categorized as a Cody event.
     *
     * We use an if/else statement here because the typechecker gets confused.
     */
    if (subfeature) {
        telemetryRecorder.recordEvent(`cody.completion.${subfeature}`, action, params)
    } else {
        telemetryRecorder.recordEvent('cody.completion', action, params)
    }
}

export interface CompletionBookkeepingEvent {
    id: CompletionLogID
    params: Omit<
        SharedEventPayload,
        'items' | 'otherCompletionProviderEnabled' | 'otherCompletionProviders'
    >
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
    // If the completion was explictly marked as "read", this is if the completion
    // was visible for at least a set amount of time
    read: boolean
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

// Maintain a cache of active suggestion requests
const activeSuggestionRequests = new LRUCache<CompletionLogID, CompletionBookkeepingEvent>({
    max: 20,
})

// Maintain a history of the last n displayed completions and their generated completion IDs. This
// allows us to reuse the completion ID across multiple suggestions.
const recentCompletions = new LRUCache<RecentCompletionKey, CompletionAnalyticsID>({
    max: 20,
})

type RecentCompletionKey = string
function getRecentCompletionsKey(params: RequestParams, completion: string): RecentCompletionKey {
    return `${params.docContext.prefix}█${completion}█${params.docContext.nextNonEmptyLine}`
}

// On our analytics dashboards, we apply a distinct count on the completion ID to count unique
// completions as suggested. Since we don't want to maintain a list of all completion IDs in
// the client, we instead retain the last few completion IDs that were marked as suggested to
// prevent local over counting.
const completionIdsMarkedAsSuggested = new LRUCache<CompletionAnalyticsID, true>({
    max: 50,
})

let persistenceTracker: PersistenceTracker<CompletionAnalyticsID> | null = null

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
        read: false,
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

export function networkRequestStarted(
    id: CompletionLogID,
    contextSummary: ContextSummary | undefined
): void {
    const event = activeSuggestionRequests.get(id)
    if (event && !event.networkRequestStartedAt) {
        event.networkRequestStartedAt = performance.now()
        event.params.contextSummary = contextSummary
    }
}

interface LoadedParams {
    logId: CompletionLogID
    requestParams: RequestParams
    completions: InlineCompletionItemWithAnalytics[]
    source: InlineCompletionsResultSource
    isDotComUser: boolean
    isFuzzyMatch: boolean
    inlineContextParams?: InlineContextItemsParams
}

export function loaded(params: LoadedParams): void {
    const {
        logId,
        requestParams,
        completions,
        source,
        isDotComUser,
        isFuzzyMatch,
        inlineContextParams = undefined,
    } = params

    const event = activeSuggestionRequests.get(logId)

    if (!event) {
        return
    }

    event.params.source = source

    // Check if we already have a completion id for the loaded completion item
    const recentCompletionKey =
        completions.length > 0 ? getRecentCompletionsKey(requestParams, completions[0].insertText) : ''

    const completionAnalyticsId =
        recentCompletions.get(recentCompletionKey) ?? (uuid.v4() as CompletionAnalyticsID)

    recentCompletions.set(recentCompletionKey, completionAnalyticsId)
    event.params.id = completionAnalyticsId
    event.params.isFuzzyMatch = isFuzzyMatch

    if (!event.loadedAt) {
        event.loadedAt = performance.now()
    }
    if (event.items.length === 0) {
        event.items = completions.map(item => completionItemToItemInfo(item, isDotComUser))
    }

    if (!event.params.resolvedModel && completions[0]?.resolvedModel) {
        event.params.resolvedModel = completions[0]?.resolvedModel
    }

    if (!event.params.responseHeaders && completions[0]?.responseHeaders) {
        event.params.responseHeaders = completions[0]?.responseHeaders
    }

    // 🚨 SECURITY: included only for DotCom users & Public github Repos.
    if (
        isDotComUser &&
        inlineContextParams?.gitUrl &&
        event.params.inlineCompletionItemContext === undefined
    ) {
        const instance = GitHubDotComRepoMetadata.getInstance()
        // Get the metadata only if already cached, We don't wait for the network call here.
        const gitRepoMetadata = instance.getRepoMetadataIfCached(inlineContextParams.gitUrl)
        if (gitRepoMetadata === undefined || !gitRepoMetadata.isPublic) {
            // 🚨 SECURITY: For Non-Public git Repos, We cannot log any code related information, just git url and commit.
            event.params.inlineCompletionItemContext = {
                gitUrl: inlineContextParams.gitUrl,
                commit: inlineContextParams.commit,
            }
            return
        }
        event.params.inlineCompletionItemContext = {
            gitUrl: inlineContextParams.gitUrl,
            commit: inlineContextParams.commit,
            filePath: inlineContextParams.filePath,
            prefix: requestParams.docContext.prefix,
            suffix: requestParams.docContext.suffix,
            triggerLine: requestParams.position.line,
            triggerCharacter: requestParams.position.character,
            context: inlineContextParams.context.map(snippet => ({
                content: snippet.content,
                startLine: snippet.startLine,
                endLine: snippet.endLine,
                filePath: snippet.uri.fsPath,
            })),
        }
    }
}

// Suggested completions will not be logged immediately. Instead, we log them when we either hide
// them again (they are NOT accepted) or when they ARE accepted. This way, we can calculate the
// duration they were actually visible for.
//
// For statistics logging we start a timeout matching the READ_TIMEOUT_MS so we can increment the
// suggested completion count as soon as we count it as such.
export function prepareSuggestionEvent(
    id: CompletionLogID,
    span?: Span
): { getEvent: () => CompletionBookkeepingEvent | undefined; markAsRead: () => void } | null {
    const event = activeSuggestionRequests.get(id)
    if (!event) {
        return null
    }

    const completionId = event.params.id
    if (!completionId) {
        throw new Error('Completion ID not set, make sure to call loaded() first')
    }

    if (!event.suggestedAt) {
        event.suggestedAt = performance.now()

        span?.setAttributes(getSharedParams(event) as any)
        span?.addEvent('suggested')

        // Mark the completion as sampled if tracing is enable for this user
        const shouldSample = completionProviderConfig.getPrefetchedFlag(
            FeatureFlag.CodyAutocompleteTracing
        )

        if (shouldSample && span) {
            span.setAttribute('sampled', true)
        }

        return {
            getEvent: () => activeSuggestionRequests.get(id),
            markAsRead: () => {
                if (completionIdsMarkedAsSuggested.has(completionId)) {
                    return
                }

                event.read = true
                statistics.logSuggested()
                completionIdsMarkedAsSuggested.set(completionId, true)
                event.suggestionAnalyticsLoggedAt = performance.now()
            },
        }
    }

    return null
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
    // always start at the beginning of the line. This means when backspacing past the initial trigger
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

    logSuggestionEvents(isDotComUser)
    logCompletionAcceptedEvent({
        ...getSharedParams(completionEvent),
        acceptedItem: completionItemToItemInfo(completion, isDotComUser),
    })
    statistics.logAccepted()

    if (trackedRange === undefined) {
        return
    }
    if (persistenceTracker === null) {
        persistenceTracker = new PersistenceTracker<CompletionAnalyticsID>(vscode.workspace, {
            onPresent: logCompletionPersistencePresentEvent,
            onRemoved: logCompletionPersistenceRemovedEvent,
        })
    }

    // The trackedRange for the completion is relative to the state before the completion was inserted.
    // We need to convert it to the state after the completion was inserted.
    const textLines = lines(completion.insertText)
    const insertRange = new vscode.Range(
        trackedRange.start.line,
        trackedRange.start.character,
        trackedRange.end.line + textLines.length - 1,

        textLines.length > 1
            ? textLines.at(-1)!.length
            : trackedRange.end.character + textLines[0].length
    )

    persistenceTracker.track({
        id: completionEvent.params.id,
        insertedAt: Date.now(),
        insertText: completion.insertText,
        insertRange,
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
export function flushActiveSuggestionRequests(isDotComUser: boolean): void {
    logSuggestionEvents(isDotComUser)
}

function getInlineContextItemToLog(
    inlineCompletionItemContext: InlineCompletionItemContext | undefined
): InlineCompletionItemContext | undefined {
    if (inlineCompletionItemContext === undefined) {
        return undefined
    }
    const MAX_CONTEXT_ITEMS = 15
    const MAX_CHARACTERS = 20_000
    return {
        ...inlineCompletionItemContext,
        prefix: inlineCompletionItemContext.prefix?.slice(-MAX_CHARACTERS),
        suffix: inlineCompletionItemContext.suffix?.slice(0, MAX_CHARACTERS),
        context: inlineCompletionItemContext.context?.slice(0, MAX_CONTEXT_ITEMS).map(c => ({
            ...c,
            content: c.content.slice(0, MAX_CHARACTERS),
        })),
    }
}

export function logSuggestionEvents(isDotComUser: boolean): void {
    const now = performance.now()
    // biome-ignore lint/complexity/noForEach: LRUCache#forEach has different typing than #entries, so just keeping it for now
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
        if (
            loadedAt === null ||
            startLoggedAt === null ||
            suggestedAt === null ||
            suggestionLoggedAt !== null ||
            params.id === null
        ) {
            return
        }
        completionEvent.suggestionLoggedAt = now

        const latency = loadedAt - startedAt
        const displayDuration = now - suggestedAt
        const accepted = acceptedAt !== null
        const read = accepted || completionEvent.read
        const inlineCompletionItemContext = getInlineContextItemToLog(
            completionEvent.params.inlineCompletionItemContext
        )

        if (!suggestionAnalyticsLoggedAt) {
            completionEvent.suggestionAnalyticsLoggedAt = now
            if (read && !completionIdsMarkedAsSuggested.has(params.id)) {
                statistics.logSuggested()
                completionIdsMarkedAsSuggested.set(params.id, true)
            }
        }

        logCompletionSuggestedEvent(isDotComUser, inlineCompletionItemContext, {
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

// Restores the logger's internals to a pristine state.
export function reset_testOnly(): void {
    activeSuggestionRequests.clear()
    completionIdsMarkedAsSuggested.clear()
    recentCompletions.clear()
    completionsStartedSinceLastSuggestion = 0
}

function lineAndCharCount({ insertText }: InlineCompletionItem): {
    lineCount: number
    charCount: number
} {
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
    if (!shouldErrorBeReported(error, false)) {
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
        upstreamLatency: upstreamHealthProvider.instance!.getUpstreamLatency(),
        gatewayLatency: upstreamHealthProvider.instance!.getGatewayLatency(),

        // 🚨 SECURITY: Do not include any context by default
        inlineCompletionItemContext: undefined,
    }
}

function completionItemToItemInfo(
    item: InlineCompletionItemWithAnalytics,
    isDotComUser: boolean
): CompletionItemInfo {
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
    'AmazonWebServices.aws-toolkit-vscode', // Includes CodeWhisperer
    'aminer.codegeex',
    'AskCodi.askcodi-autocomplete',
    'Bito.Bito',
    'Blackboxapp.blackbox',
    'CodeComplete.codecomplete-vscode',
    'Codeium.codeium-enterprise-updater',
    'Codeium.codeium',
    'Continue.continue',
    'DanielSanMedium.dscodegpt', // CodeGPT: Chat & AI Agents
    'devsense.intelli-php-vscode',
    'FittenTech.Fitten-Code',
    'GitHub.copilot-nightly',
    'GitHub.copilot',
    'mutable-ai.mutable-ai',
    'Supermaven.supermaven',
    'svipas.code-autocomplete',
    'TabbyML.vscode-tabby',
    'TabNine.tabnine-vscode-self-hosted-updater',
    'TabNine.tabnine-vscode',
    'Venthe.fauxpilot',
]
function getOtherCompletionProvider(): string[] {
    return otherCompletionProviders.filter(id => vscode.extensions.getExtension(id)?.isActive)
}

type AutocompletePipelineStage =
    | AutocompletePipelineCountedStage
    | 'preClientConfigCheck'
    | 'preContentPopupCheck'
    | 'preDocContext'
    | 'preCompletionIntent'
    | 'preGetInlineCompletions'

export class AutocompleteStageRecorder {
    private createdAt = performance.now()
    private logId?: CompletionLogID
    private isPreloadRequest: boolean

    public stageTimings = {} as Record<string, number>

    constructor(params: { isPreloadRequest: boolean }) {
        this.isPreloadRequest = params.isPreloadRequest
    }

    public setLogId(logId: CompletionLogID): void {
        this.logId = logId
    }

    public record(eventName: AutocompletePipelineStage): void {
        if (this.isPreloadRequest) {
            // Do not record events for preload requests.
            return
        }

        // Record event for OpenTelemetry traces.
        trace.getActiveSpan()?.addEvent(eventName)

        // Record event timing to later assign it to the analytics event.
        this.stageTimings[eventName] = performance.now() - this.createdAt

        if (this.logId) {
            const event = activeSuggestionRequests.get(this.logId)

            if (event) {
                event.params.stageTimings = this.stageTimings
            }
        }

        // Count event in the autocomplete stage counter if it's a counted stage.
        if (eventName in AUTOCOMPLETE_STAGE_COUNTER_INITIAL_STATE) {
            autocompleteStageCounterLogger.record(eventName as AutocompletePipelineCountedStage)
        }
    }
}
