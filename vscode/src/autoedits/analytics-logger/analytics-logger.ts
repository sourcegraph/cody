import capitalize from 'lodash/capitalize'
import { LRUCache } from 'lru-cache'
import * as uuid from 'uuid'
import * as vscode from 'vscode'

import {
    type BillingCategory,
    type BillingProduct,
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

import type { AutoeditModelOptions } from '../adapters/base'
import { AutoeditSuggestionIdRegistry } from './suggestion-id-registry'

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
    /** The autoedit suggestion has been suggested to the user. */
    | 'suggested'
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
    loaded: ['suggested', 'discarded'],
    suggested: ['accepted', 'rejected'],
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
    traceId: string

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

interface AutoeditLoadedMetadata extends AutoeditContextLoadedMetadata {
    /**
     * An ID to uniquely identify a suggest autoedit. Note: It is possible for this ID to be part
     * of two suggested events. This happens when the exact same autoedit text is shown again at
     * the exact same location. We count this as the same autoedit and thus use the same ID.
     */
    id: AutoeditSuggestionID

    /** Total lines in the suggestion. */
    lineCount: number

    /** Total characters in the suggestion. */
    charCount: number

    /**
     * Prediction text snippet of the suggestion.
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

interface AutoEditFinalMetadata extends AutoeditLoadedMetadata {
    /** Displayed to the user for this many milliseconds. */
    displayDuration: number
    /** True if the suggestion was explicitly/intentionally accepted. */
    isAccepted: boolean
    /** The number of the auto-edits started since the last suggestion was shown. */
    suggestionsStartedSinceLastSuggestion: number
}

interface AutoeditAcceptedEventPayload
    extends AutoEditFinalMetadata,
        Omit<CodeGenEventMetadata, 'charsInserted' | 'charsDeleted'> {}

interface AutoeditRejectedEventPayload extends AutoEditFinalMetadata {}
interface AutoeditDiscardedEventPayload extends AutoeditContextLoadedMetadata {}

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

interface StartedState extends AutoeditBaseState {
    phase: 'started'
    /** Time (ms) when we started computing or requesting the suggestion. */
    startedAt: number
    /** Partial payload for this phase. Will be augmented with more info as we progress. */
    payload: AutoeditStartedMetadata
}

interface ContextLoadedState extends Omit<StartedState, 'phase'> {
    phase: 'contextLoaded'
    payload: AutoeditContextLoadedMetadata
}

interface LoadedState extends Omit<ContextLoadedState, 'phase'> {
    phase: 'loaded'
    /** Timestamp when the suggestion completed generation/loading. */
    loadedAt: number
    payload: AutoeditLoadedMetadata
}

interface SuggestedState extends Omit<LoadedState, 'phase'> {
    phase: 'suggested'
    /** Timestamp when the suggestion was first shown to the user. */
    suggestedAt: number
}

interface AcceptedState extends Omit<SuggestedState, 'phase'> {
    phase: 'accepted'
    /** Timestamp when the user accepted the suggestion. */
    acceptedAt: number
    /** Timestamp when the suggestion was logged to our analytics backend. This is to avoid double-logging. */
    suggestionLoggedAt?: number
    payload: AutoeditAcceptedEventPayload
}

interface RejectedState extends Omit<SuggestedState, 'phase'> {
    phase: 'rejected'
    /** Timestamp when the suggestion was logged to our analytics backend. This is to avoid double-logging. */
    suggestionLoggedAt?: number
    payload: AutoeditRejectedEventPayload
}

interface DiscardedState extends Omit<StartedState, 'phase'> {
    phase: 'discarded'
    /** Timestamp when the suggestion was logged to our analytics backend. This is to avoid double-logging. */
    suggestionLoggedAt?: number
    payload: AutoeditDiscardedEventPayload
}

interface PhaseStates {
    started: StartedState
    contextLoaded: ContextLoadedState
    loaded: LoadedState
    suggested: SuggestedState
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

type AutoeditRequestState = PhaseStates[Phase]

type AutoeditEventAction =
    | 'suggested'
    | 'accepted'
    | 'discarded'
    | 'error'
    | `invalidTransitionTo${Capitalize<Phase>}`

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
     * Encapsulates the logic for reusing stable suggestion IDs for repeated text/context.
     */
    private suggestionIdRegistry = new AutoeditSuggestionIdRegistry()

    /**
     * Tracks repeated errors via their message key to avoid spamming logs.
     */
    private errorCounts = new Map<AutoeditErrorMessage, number>()
    private autoeditsStartedSinceLastSuggestion = 0
    private ERROR_THROTTLE_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

    /**
     * Creates a new ephemeral request with initial metadata. At this stage, we do not have the prediction yet.
     */
    public createRequest(
        payload: Required<
            Pick<
                AutoeditStartedMetadata,
                'languageId' | 'model' | 'traceId' | 'triggerKind' | 'codeToRewrite'
            >
        >
    ): AutoeditRequestID {
        const { codeToRewrite, ...restPayload } = payload
        const requestId = uuid.v4() as AutoeditRequestID
        const otherCompletionProviders = getOtherCompletionProvider()

        const request: StartedState = {
            requestId,
            phase: 'started',
            startedAt: getTimeNowInMillis(),
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
        modelOptions,
        payload,
    }: {
        requestId: AutoeditRequestID
        modelOptions: AutoeditModelOptions
        payload: Required<
            Pick<AutoeditLoadedMetadata, 'source' | 'isFuzzyMatch' | 'responseHeaders' | 'prediction'>
        >
    }): void {
        const { prediction, source, isFuzzyMatch, responseHeaders } = payload
        const stableId = this.suggestionIdRegistry.getOrCreate(modelOptions, prediction)
        const loadedAt = getTimeNowInMillis()

        this.tryTransitionTo(requestId, 'loaded', request => ({
            ...request,
            loadedAt,
            payload: {
                ...request.payload,
                id: stableId,
                lineCount: lines(prediction).length,
                charCount: prediction.length,
                // 🚨 SECURITY: included only for DotCom users.
                prediction: isDotComAuthed() && prediction.length < 300 ? prediction : undefined,
                source,
                isFuzzyMatch,
                responseHeaders,
                latency: loadedAt - request.startedAt,
            },
        }))
    }

    public markAsSuggested(requestId: AutoeditRequestID): SuggestedState | null {
        const result = this.tryTransitionTo(requestId, 'suggested', currentRequest => ({
            ...currentRequest,
            suggestedAt: getTimeNowInMillis(),
        }))

        if (!result) {
            return null
        }

        // Reset the number of the auto-edits started since the last suggestion.
        this.autoeditsStartedSinceLastSuggestion = 0

        return result.updatedRequest
    }

    public markAsAccepted({
        requestId,
        trackedRange,
        position,
        document,
        prediction,
    }: {
        requestId: AutoeditRequestID
        trackedRange?: vscode.Range
        position: vscode.Position
        document: vscode.TextDocument
        prediction: string
    }): void {
        const acceptedAt = getTimeNowInMillis()

        const result = this.tryTransitionTo(requestId, 'accepted', request => {
            // Ensure the AutoeditSuggestionID is never reused by removing it from the suggestion id registry
            this.suggestionIdRegistry.deleteEntryIfValueExists(request.payload.id)

            // Calculate metadata required for PCW.
            const rangeForCharacterMetadata = trackedRange || new vscode.Range(position, position)
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
                    displayDuration: acceptedAt - request.suggestedAt,
                    suggestionsStartedSinceLastSuggestion: this.autoeditsStartedSinceLastSuggestion,
                },
            }
        })

        if (result?.updatedRequest) {
            this.writeAutoeditRequestEvent('suggested', result.updatedRequest)
            this.writeAutoeditRequestEvent('accepted', result.updatedRequest)

            this.activeRequests.delete(result.updatedRequest.requestId)
        }
    }

    public markAsRejected(requestId: AutoeditRequestID): void {
        const result = this.tryTransitionTo(requestId, 'rejected', request => ({
            ...request,
            payload: {
                ...request.payload,
                isAccepted: false,
                displayDuration: getTimeNowInMillis() - request.suggestedAt,
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

    public markAsDiscarded(requestId: AutoeditRequestID): void {
        const result = this.tryTransitionTo(requestId, 'discarded', currentRequest => currentRequest)

        if (result?.updatedRequest) {
            this.writeAutoeditRequestEvent('discarded', result.updatedRequest)
            this.activeRequests.delete(result.updatedRequest.requestId)
        }
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
            this.writeDebugBookkeepingEvent(
                `invalidTransitionTo${capitalize(nextPhase) as Capitalize<Phase>}`
            )

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
        this.writeAutoeditEvent(action, {
            version: 0,
            // Extract `id` from payload into the first-class `interactionId` field.
            interactionID: 'id' in payload ? payload.id : undefined,
            metadata: {
                ...metadata,
                recordsPrivateMetadataTranscript: 'prediction' in privateMetadata ? 1 : 0,
            },
            privateMetadata,
            billingMetadata: {
                product: 'cody',
                // TODO: double check with the analytics team
                // whether we should be categorizing the different completion event types.
                category: action === 'suggested' ? 'billable' : 'core',
            },
        })
    }

    private writeAutoeditEvent(
        action: AutoeditEventAction,
        params?: TelemetryEventParameters<{ [key: string]: number }, BillingProduct, BillingCategory>
    ): void {
        telemetryRecorder.recordEvent('cody.autoedit', action, params)
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
        if (currentCount === 0) {
            this.writeAutoeditEvent('error', {
                version: 0,
                metadata: { count: 1 },
                privateMetadata: { message: error.message, traceId },
            })

            // After the interval, flush repeated errors
            setTimeout(() => {
                const finalCount = this.errorCounts.get(messageKey) ?? 0
                if (finalCount > 0) {
                    this.writeAutoeditEvent('error', {
                        version: 0,
                        metadata: { count: finalCount },
                        privateMetadata: { message: error.message, traceId },
                    })
                }
                this.errorCounts.set(messageKey, 0)
            }, this.ERROR_THROTTLE_INTERVAL_MS)
        }
        this.errorCounts.set(messageKey, currentCount + 1)
    }

    private writeDebugBookkeepingEvent(action: `invalidTransitionTo${Capitalize<Phase>}`): void {
        this.writeAutoeditEvent(action)
    }
}

export const autoeditAnalyticsLogger = new AutoeditAnalyticsLogger()

export function getTimeNowInMillis(): number {
    return Math.floor(performance.now())
}
