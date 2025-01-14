import capitalize from 'lodash/capitalize'
import { LRUCache } from 'lru-cache'
import * as uuid from 'uuid'
import type * as vscode from 'vscode'

import {
    type BillingCategory,
    type BillingProduct,
    type DocumentContext,
    isDotComAuthed,
    isNetworkError,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import type { TelemetryEventParameters } from '@sourcegraph/telemetry'

import { getOtherCompletionProvider } from '../../completions/analytics-logger'
import type { ContextSummary } from '../../completions/context/context-mixer'
import { lines } from '../../completions/text-processing'
import { type CodeGenEventMetadata, charactersLogger } from '../../services/CharactersLogger'
import { upstreamHealthProvider } from '../../services/UpstreamHealthProvider'
import { captureException, shouldErrorBeReported } from '../../services/sentry/sentry'
import { splitSafeMetadata } from '../../services/telemetry-v2'
import type { AutoeditsPrompt } from '../adapters/base'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { CodeToReplaceData } from '../prompt/prompt-utils'
import type { DecorationInfo } from '../renderer/decorators/base'
import { type DecorationStats, getDecorationStats } from '../renderer/diff-utils'

import { autoeditIdRegistry } from './suggestion-id-registry'

/**
 * This file implements a state machine to manage the lifecycle of an autoedit request.
 * Each phase of the request is represented by a distinct state interface, and metadata
 * evolves as the request progresses.
 *
 * 1. Each autoedit request phase (e.g., `started`, `loaded`, `accepted`) is represented by a
 *    `state` interface that extends `AutoeditBaseState` and adds phase-specific fields.
 *
 * 2. Valid transitions between phases are enforced using the `validRequestTransitions` map,
 *    ensuring logical progression through the request lifecycle.
 *
 * 3. The `payload` field in each state encapsulates the exact list of fields that we plan to send
 *    to our analytics backend.
 *
 * 4. Other top-level `state` fields are saved only for bookkeeping and won't end up at our
 *    analytics backend. This ensures we don't send unintentional or redundant information to
 *    the analytics backend.
 *
 * 5. Metadata is progressively enriched as the request transitions between states.
 *
 * 6. Eventually, once we reach one of the terminal states and log its current `payload`.
 */

/**
 * Defines the possible phases of our autoedit request state machine.
 */
type Phase =
    /** The autoedit request has started. */
    | 'started'
    /** The context for the autoedit has been loaded. */
    | 'contextLoaded'
    /** The autoedit suggestion has been loaded — we have a prediction string. */
    | 'loaded'
    /**
     * The suggestion is not discard during post processing and we have all the data to render the suggestion.
     * This intermediate step is required for the agent API. We cannot graduate the request to the suggested
     * state right away. We first need to save requests metadata to the analytics logger cache, so that
     * agent can access it using the request ID only in `unstable_handleDidShowCompletionItem` calls.
     */
    | 'postProcessed'
    /** The autoedit suggestion has been suggested to the user. */
    | 'suggested'
    /** The autoedit suggestion is marked as read is it's still visible to the user after a hardcoded timeout. */
    | 'read'
    /** The user has accepted the suggestion. */
    | 'accepted'
    /** The user has rejected the suggestion. */
    | 'rejected'
    /** The autoedit request was discarded by our heuristics before being suggested to a user */
    | 'discarded'

/**
 * Defines which phases can transition to which other phases.
 */
const validRequestTransitions = {
    started: ['contextLoaded', 'discarded'],
    contextLoaded: ['loaded', 'discarded'],
    loaded: ['postProcessed', 'discarded'],
    postProcessed: ['suggested', 'discarded'],
    suggested: ['read', 'accepted', 'rejected'],
    read: ['accepted', 'rejected'],
    accepted: [],
    rejected: [],
    discarded: [],
} as const satisfies Record<Phase, readonly Phase[]>

export const autoeditTriggerKind = {
    /** Suggestion was triggered automatically while editing. */
    automatic: 1,

    /** Suggestion was triggered manually by the user invoking the keyboard shortcut. */
    manual: 2,

    /** When the user uses the suggest widget to cycle through different suggestions. */
    suggestWidget: 3,

    /** Suggestion was triggered automatically by the selection change event. */
    cursor: 4,
} as const

/** We use numeric keys to send these to the analytics backend */
type AutoeditTriggerKindMetadata = (typeof autoeditTriggerKind)[keyof typeof autoeditTriggerKind]

interface AutoeditStartedMetadata {
    /** Document language ID (e.g., 'typescript'). */
    languageId: string

    /** Model used by Cody client to request the autosuggestion suggestion. */
    model: string

    /** Optional trace ID for cross-service correlation, if your environment provides it. */
    traceId?: string

    /** Describes how the autoedit request was triggered by the user. */
    triggerKind: AutoeditTriggerKindMetadata

    /**
     * The code to rewrite by autoedit.
     * 🚨 SECURITY: included only for DotCom users.
     */
    codeToRewrite?: string

    /** True if other autoedit/completion providers might also be active (e.g., Copilot). */
    otherCompletionProviderEnabled: boolean

    /** The exact list of other providers that are active, if known. */
    otherCompletionProviders: string[]

    /** The round trip timings to reach the Sourcegraph and Cody Gateway instances. */
    upstreamLatency?: number
    gatewayLatency?: number
}

interface AutoeditContextLoadedMetadata extends AutoeditStartedMetadata {
    /**
     * Information about the context retrieval process that lead to this autoedit request. Refer
     * to the documentation of {@link ContextSummary}
     */
    contextSummary?: ContextSummary
}

/**
 * A stable ID that identifies a particular autoedit suggestion. If the same text
 * and context recurs, we reuse this ID to avoid double-counting.
 */
export type AutoeditSuggestionID = string & { readonly _brand: 'AutoeditSuggestionID' }

export const autoeditSource = {
    /** Autoedit originated from a request to our backend for the suggestion.  */
    network: 1,
    /** Autoedit originated from a client cached suggestion.  */
    cache: 2,
} as const

/** We use numeric keys to send these to the analytics backend */
type AutoeditSourceMetadata = (typeof autoeditSource)[keyof typeof autoeditSource]

export const autoeditDiscardReason = {
    clientAborted: 1,
    emptyPrediction: 2,
    predictionEqualsCodeToRewrite: 3,
    recentEdits: 4,
    suffixOverlap: 5,
    emptyPredictionAfterInlineCompletionExtraction: 6,
    noActiveEditor: 7,
    conflictingDecorationWithEdits: 8,
    notEnoughLinesEditor: 9,
} as const

/** We use numeric keys to send these to the analytics backend */
type AutoeditDiscardReasonMetadata = (typeof autoeditDiscardReason)[keyof typeof autoeditDiscardReason]

interface AutoeditLoadedMetadata extends AutoeditContextLoadedMetadata {
    /**
     * An ID to uniquely identify a suggest autoedit. Note: It is possible for this ID to be part
     * of two suggested events. This happens when the exact same autoedit text is shown again at
     * the exact same location. We count this as the same autoedit and thus use the same ID.
     */
    id: AutoeditSuggestionID

    /**
     * Unmodified by the client prediction text snippet of the suggestion.
     * Might be `undefined` if too long.
     * 🚨 SECURITY: included only for DotCom users.
     */
    prediction?: string

    /** The source of the suggestion, e.g. 'network', 'cache', etc. */
    source?: AutoeditSourceMetadata

    /** True if we fuzzy-matched this suggestion from a local or remote cache. */
    isFuzzyMatch?: boolean

    /** Optional set of relevant response headers (e.g. from Cody Gateway). */
    responseHeaders?: Record<string, string>

    /** Time (ms) to generate or load the suggestion after it was started. */
    latency: number
}

interface AutoeditPostProcessedMetadata extends AutoeditLoadedMetadata {
    /** The number of added, modified, removed lines and characters from suggestion. */
    decorationStats?: DecorationStats
    /** The number of lines and added chars attributed to an inline completion item. */
    inlineCompletionStats?: {
        lineCount: number
        charCount: number
    }
}

interface AutoEditFinalMetadata extends AutoeditPostProcessedMetadata {
    /** Displayed to the user for this many milliseconds. */
    timeFromSuggestedAt: number
    /** True if the suggestion was explicitly/intentionally accepted. */
    isAccepted: boolean
    /**
     * True if the suggestion was visible for a certain time
     * Required to correctly calculate CAR and other metrics where we
     * want to account only for suggestions visible for a certain time.
     *
     * `timeFromSuggestedAt` is not a reliable source of truth for
     * this case because a user could have rejected a suggestion without
     * triggering `accepted` or `discarded` immediately. This is related to
     * limited VS Code APIs which do not provide a reliable way to know
     * if a suggestion is really visible.
     */
    isRead: boolean
    /** The number of the auto-edit started since the last suggestion was shown. */
    suggestionsStartedSinceLastSuggestion: number
}

interface AutoeditAcceptedEventPayload
    extends AutoEditFinalMetadata,
        Omit<CodeGenEventMetadata, 'charsInserted' | 'charsDeleted'> {}

interface AutoeditRejectedEventPayload extends AutoEditFinalMetadata {}
interface AutoeditDiscardedEventPayload extends AutoeditContextLoadedMetadata {
    discardReason: AutoeditDiscardReasonMetadata
}

/**
 * An ephemeral ID for a single “request” from creation to acceptance or rejection.
 */
export type AutoeditRequestID = string & { readonly _brand: 'AutoeditRequestID' }

/**
 * The base fields common to all request states. We track ephemeral times and
 * the partial payload. Once we reach a certain phase, we log the payload as a telemetry event.
 */
interface AutoeditBaseState {
    requestId: AutoeditRequestID
    /** Current phase of the autoedit request */
    phase: Phase
}

export interface StartedState extends AutoeditBaseState {
    phase: 'started'
    /** Time (ms) when we started computing or requesting the suggestion. */
    startedAt: number

    /** Metadata required to show a suggestion based on `requestId` only. */
    codeToReplaceData: CodeToReplaceData
    document: vscode.TextDocument
    position: vscode.Position
    docContext: DocumentContext

    /** Partial payload for this phase. Will be augmented with more info as we progress. */
    payload: AutoeditStartedMetadata
}

export interface ContextLoadedState extends Omit<StartedState, 'phase'> {
    phase: 'contextLoaded'
    payload: AutoeditContextLoadedMetadata
}

export interface LoadedState extends Omit<ContextLoadedState, 'phase'> {
    phase: 'loaded'
    /** Timestamp when the suggestion completed generation/loading. */
    loadedAt: number
    payload: AutoeditLoadedMetadata
}

export interface PostProcessedState extends Omit<LoadedState, 'phase'> {
    phase: 'postProcessed'

    /** Metadata required to show a suggestion based on `requestId` only. */
    prediction: string
    decorationInfo: DecorationInfo | null
    inlineCompletionItems: vscode.InlineCompletionItem[] | null

    payload: AutoeditPostProcessedMetadata
}

export interface SuggestedState extends Omit<PostProcessedState, 'phase'> {
    phase: 'suggested'
    /** Timestamp when the suggestion was first shown to the user. */
    suggestedAt: number
}

export interface ReadState extends Omit<SuggestedState, 'phase'> {
    phase: 'read'
    /** Timestamp when the suggestion was marked as visible to the user. */
    readAt: number
}

export interface AcceptedState extends Omit<SuggestedState, 'phase'> {
    phase: 'accepted'
    /** Timestamp when the user accepted the suggestion. */
    acceptedAt: number
    /** Timestamp when the suggestion was logged to our analytics backend. This is to avoid double-logging. */
    suggestionLoggedAt?: number
    /** Optional because it might be accepted before the read timeout */
    readAt?: number
    payload: AutoeditAcceptedEventPayload
}

export interface RejectedState extends Omit<SuggestedState, 'phase'> {
    phase: 'rejected'
    /** Timestamp when the suggestion was logged to our analytics backend. This is to avoid double-logging. */
    suggestionLoggedAt?: number
    /** Optional because it might be accepted before the read timeout */
    readAt?: number
    payload: AutoeditRejectedEventPayload
}

export interface DiscardedState extends Omit<StartedState, 'phase'> {
    phase: 'discarded'
    /** Timestamp when the suggestion was logged to our analytics backend. This is to avoid double-logging. */
    suggestionLoggedAt?: number
    payload: AutoeditDiscardedEventPayload
}

interface PhaseStates {
    started: StartedState
    contextLoaded: ContextLoadedState
    loaded: LoadedState
    postProcessed: PostProcessedState
    suggested: SuggestedState
    read: ReadState
    accepted: AcceptedState
    rejected: RejectedState
    discarded: DiscardedState
}

/**
 * Using the validTransitions definition, we can derive which "from phases" lead to a given next phase,
 * and map that to the correct PhaseStates[fromPhase].
 */
type PreviousPossiblePhaseFrom<T extends Phase> = {
    [F in Phase]: T extends (typeof validRequestTransitions)[F][number] ? PhaseStates[F] : never
}[Phase]

export type AutoeditRequestState = PhaseStates[Phase]

type AutoeditEventAction =
    | 'suggested'
    | 'accepted'
    | 'discarded'
    | 'error'
    | `invalidTransitionTo${Capitalize<Phase>}`

const AUTOEDIT_EVENT_BILLING_CATEGORY: Partial<Record<AutoeditEventAction, BillingCategory>> = {
    accepted: 'core',
    discarded: 'billable',
    suggested: 'billable',
}

/**
 * Specialized string type for referencing error messages in our rate-limiting map.
 */
type AutoeditErrorMessage = string & { readonly _brand: 'AutoeditErrorMessage' }

export class AutoeditAnalyticsLogger {
    /**
     * Stores ephemeral AutoeditRequestState for each request ID.
     */
    private activeRequests = new LRUCache<AutoeditRequestID, AutoeditRequestState>({ max: 20 })

    /**
     * Tracks repeated errors via their message key to avoid spamming logs.
     */
    private errorCounts = new Map<AutoeditErrorMessage, number>()
    private autoeditsStartedSinceLastSuggestion = 0
    private ERROR_THROTTLE_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

    /**
     * Creates a new ephemeral request with initial metadata. At this stage, we do not have the prediction yet.
     */
    public createRequest({
        startedAt,
        payload,
        codeToReplaceData,
        document,
        position,
        docContext,
    }: {
        startedAt: number
        codeToReplaceData: CodeToReplaceData
        document: vscode.TextDocument
        position: vscode.Position
        docContext: DocumentContext
        payload: Required<
            Pick<AutoeditStartedMetadata, 'languageId' | 'model' | 'triggerKind' | 'codeToRewrite'>
        >
    }): AutoeditRequestID {
        const { codeToRewrite, ...restPayload } = payload
        const requestId = uuid.v4() as AutoeditRequestID
        const otherCompletionProviders = getOtherCompletionProvider()

        const request: StartedState = {
            requestId,
            phase: 'started',
            startedAt,
            codeToReplaceData,
            document,
            position,
            docContext,
            payload: {
                otherCompletionProviderEnabled: otherCompletionProviders.length > 0,
                otherCompletionProviders,
                upstreamLatency: upstreamHealthProvider.getUpstreamLatency(),
                gatewayLatency: upstreamHealthProvider.getGatewayLatency(),
                // 🚨 SECURITY: included only for DotCom users.
                codeToRewrite: isDotComAuthed() ? codeToRewrite : undefined,
                ...restPayload,
            },
        }

        this.activeRequests.set(requestId, request)
        this.autoeditsStartedSinceLastSuggestion++
        return requestId
    }

    public markAsContextLoaded({
        requestId,
        payload,
    }: {
        requestId: AutoeditRequestID
        payload: Pick<AutoeditContextLoadedMetadata, 'contextSummary'>
    }): void {
        this.tryTransitionTo(requestId, 'contextLoaded', request => ({
            ...request,
            payload: {
                ...request.payload,
                contextSummary: payload.contextSummary,
            },
        }))
    }

    /**
     * Mark when the suggestion finished generating/loading. This is also where
     * we finally receive the prediction text, create a stable suggestion ID,
     * and store the full suggestion metadata in ephemeral state.
     */
    public markAsLoaded({
        requestId,
        prompt,
        payload,
    }: {
        requestId: AutoeditRequestID
        prompt: AutoeditsPrompt
        payload: Required<
            Pick<AutoeditLoadedMetadata, 'source' | 'isFuzzyMatch' | 'responseHeaders' | 'prediction'>
        >
    }): void {
        const { prediction, source, isFuzzyMatch, responseHeaders } = payload
        const stableId = autoeditIdRegistry.getOrCreate(prompt, prediction)
        const loadedAt = getTimeNowInMillis()

        this.tryTransitionTo(requestId, 'loaded', request => {
            return {
                ...request,
                loadedAt,
                payload: {
                    ...request.payload,
                    id: stableId,
                    // 🚨 SECURITY: included only for DotCom users.
                    prediction: isDotComAuthed() && prediction.length < 300 ? prediction : undefined,
                    source,
                    isFuzzyMatch,
                    responseHeaders,
                    latency: Math.floor(loadedAt - request.startedAt),
                },
            }
        })
    }

    public markAsPostProcessed({
        requestId,
        decorationInfo,
        inlineCompletionItems,
        prediction,
    }: {
        requestId: AutoeditRequestID
        prediction: string
        decorationInfo: DecorationInfo | null
        inlineCompletionItems: vscode.InlineCompletionItem[] | null
    }) {
        this.tryTransitionTo(requestId, 'postProcessed', request => {
            const insertText = inlineCompletionItems?.length
                ? (inlineCompletionItems[0].insertText as string).slice(
                      request.docContext.currentLinePrefix.length
                  )
                : undefined

            return {
                ...request,
                prediction,
                decorationInfo,
                inlineCompletionItems,
                payload: {
                    ...request.payload,
                    decorationStats: decorationInfo ? getDecorationStats(decorationInfo) : undefined,
                    inlineCompletionStats: insertText
                        ? {
                              lineCount: lines(insertText).length,
                              charCount: insertText.length,
                          }
                        : undefined,
                },
            }
        })
    }

    public markAsSuggested(requestId: AutoeditRequestID): SuggestedState | null {
        const result = this.tryTransitionTo(requestId, 'suggested', currentRequest => ({
            ...currentRequest,
            suggestedAt: getTimeNowInMillis(),
        }))

        if (!result) {
            return null
        }

        return result.updatedRequest
    }

    public markAsRead(requestId: AutoeditRequestID): void {
        this.tryTransitionTo(requestId, 'read', currentRequest => ({
            ...currentRequest,
            readAt: getTimeNowInMillis(),
        }))
    }

    public markAsAccepted(requestId: AutoeditRequestID): void {
        const acceptedAt = getTimeNowInMillis()

        const result = this.tryTransitionTo(requestId, 'accepted', request => {
            const { codeToReplaceData, document, prediction, payload } = request

            // Ensure the AutoeditSuggestionID is never reused by removing it from the suggestion id registry
            autoeditIdRegistry.deleteEntryIfValueExists(payload.id)

            // Calculate metadata required for PCW.
            const rangeForCharacterMetadata = codeToReplaceData.range
            const { charsDeleted, charsInserted, ...charactersLoggerMetadata } =
                charactersLogger.getChangeEventMetadataForCodyCodeGenEvents({
                    document,
                    contentChanges: [
                        {
                            range: rangeForCharacterMetadata,
                            rangeOffset: document.offsetAt(rangeForCharacterMetadata.start),
                            rangeLength: 0,
                            text: prediction,
                        },
                    ],
                    reason: undefined,
                })

            return {
                ...request,
                acceptedAt,
                payload: {
                    ...request.payload,
                    ...charactersLoggerMetadata,
                    isAccepted: true,
                    isRead: true,
                    timeFromSuggestedAt: acceptedAt - request.suggestedAt,
                    suggestionsStartedSinceLastSuggestion: this.autoeditsStartedSinceLastSuggestion,
                },
            }
        })

        if (result?.updatedRequest) {
            this.writeAutoeditRequestEvent('suggested', result.updatedRequest)
            this.writeAutoeditRequestEvent('accepted', result.updatedRequest)
        }
    }

    public markAsRejected(requestId: AutoeditRequestID): void {
        const result = this.tryTransitionTo(requestId, 'rejected', request => ({
            ...request,
            payload: {
                ...request.payload,
                isAccepted: false,
                isRead: 'readAt' in request,
                timeFromSuggestedAt: getTimeNowInMillis() - request.suggestedAt,
                suggestionsStartedSinceLastSuggestion: this.autoeditsStartedSinceLastSuggestion,
            },
        }))

        if (result?.updatedRequest) {
            this.writeAutoeditRequestEvent('suggested', result.updatedRequest)

            // Suggestions are kept in the LRU cache for longer. This is because they
            // can still become visible if e.g. they are served from the cache and we
            // need to retain the ability to mark them as seen.
        }
    }

    public markAsDiscarded({
        requestId,
        discardReason,
    }: {
        requestId: AutoeditRequestID
        discardReason: AutoeditDiscardReasonMetadata
    }): void {
        const result = this.tryTransitionTo(requestId, 'discarded', request => {
            return {
                ...request,
                payload: {
                    ...request.payload,
                    discardReason: discardReason,
                },
            }
        })

        if (result?.updatedRequest) {
            this.writeAutoeditRequestEvent('discarded', result.updatedRequest)
        }
    }

    public getRequest(requestId: AutoeditRequestID): AutoeditRequestState | undefined {
        return this.activeRequests.get(requestId)
    }

    private tryTransitionTo<P extends Phase>(
        requestId: AutoeditRequestID,
        nextPhase: P,
        patch: (currentRequest: PreviousPossiblePhaseFrom<P>) => Omit<PhaseStates[P], 'phase'>
    ): { currentRequest: PreviousPossiblePhaseFrom<P>; updatedRequest: PhaseStates[P] } | null {
        const currentRequest = this.getRequestIfReadyForNextPhase(requestId, nextPhase)

        if (!currentRequest) {
            return null
        }

        const updatedRequest = {
            ...currentRequest,
            ...patch(currentRequest),
            phase: nextPhase,
        } as PhaseStates[P]

        this.activeRequests.set(requestId, updatedRequest)
        return { updatedRequest, currentRequest }
    }

    /**
     * Retrieves the request if it is in a phase that can transition to nextPhase,
     * returning null if not found or if the transition is invalid. Uses the derived
     * PreviousPossiblePhaseFrom type so that the returned State has the correct fields.
     */
    private getRequestIfReadyForNextPhase<T extends Phase>(
        requestId: AutoeditRequestID,
        nextPhase: T
    ): PreviousPossiblePhaseFrom<T> | null {
        const request = this.activeRequests.get(requestId)

        if (
            !request ||
            !(validRequestTransitions[request.phase] as readonly Phase[]).includes(nextPhase)
        ) {
            this.writeAutoeditEvent({
                action: `invalidTransitionTo${capitalize(nextPhase) as Capitalize<Phase>}`,
                logDebugArgs: [request ? `from: "${request.phase}"` : 'missing request'],
            })

            return null
        }

        return request as PreviousPossiblePhaseFrom<T>
    }

    private writeAutoeditRequestEvent(
        action: AutoeditEventAction,
        state: AcceptedState | RejectedState | DiscardedState
    ): void {
        const { suggestionLoggedAt, payload } = state

        if (action === 'suggested' && suggestionLoggedAt) {
            return
        }

        // Update the request state to mark the suggestion as logged.
        state.suggestionLoggedAt = getTimeNowInMillis()

        const { metadata, privateMetadata } = splitSafeMetadata(payload)
        const billingCategory = AUTOEDIT_EVENT_BILLING_CATEGORY[action]

        this.writeAutoeditEvent({
            action,
            logDebugArgs: terminalStateToLogDebugArgs(action, state),
            telemetryParams: {
                version: 0,
                // Extract `id` from payload into the first-class `interactionId` field.
                interactionID: 'id' in payload ? payload.id : undefined,
                metadata: {
                    ...metadata,
                    recordsPrivateMetadataTranscript: 'prediction' in privateMetadata ? 1 : 0,
                },
                privateMetadata,
                ...(billingCategory && {
                    billingMetadata: {
                        product: 'cody',
                        category: billingCategory,
                    },
                }),
            },
        })
    }

    private writeAutoeditEvent({
        action,
        logDebugArgs,
        telemetryParams,
    }: {
        action: AutoeditEventAction
        logDebugArgs: readonly [string, ...unknown[]]
        telemetryParams?: TelemetryEventParameters<
            { [key: string]: number },
            BillingProduct,
            BillingCategory
        >
    }): void {
        autoeditsOutputChannelLogger.logDebug('writeAutoeditEvent', action, ...logDebugArgs)
        telemetryRecorder.recordEvent('cody.autoedit', action, telemetryParams)
    }

    /**
     * Rate-limited error logging, capturing exceptions with Sentry and grouping repeated logs.
     */
    public logError(error: Error): void {
        if (!shouldErrorBeReported(error, false)) {
            return
        }
        captureException(error)

        const messageKey = error.message as AutoeditErrorMessage
        const traceId = isNetworkError(error) ? error.traceId : undefined

        const currentCount = this.errorCounts.get(messageKey) ?? 0
        const logDebugArgs = [error.name, { verbose: { message: error.message } }] as const
        if (currentCount === 0) {
            this.writeAutoeditEvent({
                action: 'error',
                logDebugArgs,
                telemetryParams: {
                    version: 0,
                    metadata: { count: 1 },
                    privateMetadata: { message: error.message, traceId },
                },
            })

            // After the interval, flush repeated errors
            setTimeout(() => {
                const finalCount = this.errorCounts.get(messageKey) ?? 0
                if (finalCount > 0) {
                    this.writeAutoeditEvent({
                        action: 'error',
                        logDebugArgs,
                        telemetryParams: {
                            version: 0,
                            metadata: { count: finalCount },
                            privateMetadata: { message: error.message, traceId },
                        },
                    })
                }
                this.errorCounts.set(messageKey, 0)
            }, this.ERROR_THROTTLE_INTERVAL_MS)
        }
        this.errorCounts.set(messageKey, currentCount + 1)
    }
}

export const autoeditAnalyticsLogger = new AutoeditAnalyticsLogger()

export function getTimeNowInMillis(): number {
    return Math.floor(performance.now())
}

function terminalStateToLogDebugArgs(
    action: AutoeditEventAction,
    { requestId, phase, payload }: AcceptedState | RejectedState | DiscardedState
): readonly [string, ...unknown[]] {
    if (action === 'suggested' && (phase === 'rejected' || phase === 'accepted')) {
        return [`"${requestId}" latency:"${payload.latency}ms" isRead:"${payload.isRead}"`]
    }

    return [`"${requestId}"`]
}
