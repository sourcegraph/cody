import capitalize from 'lodash/capitalize'
import { LRUCache } from 'lru-cache'
import * as uuid from 'uuid'
import * as vscode from 'vscode'

import {
    type BillingCategory,
    type BillingProduct,
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
 * This file implements a state machine to manage the lifecycle of an autoedit session.
 * Each phase of the session is represented by a distinct state interface, and metadata
 * evolves as the session progresses.
 *
 * 1. **State Relationships:**
 *    - The `AutoeditBaseState` defines common properties shared across all states.
 *    - Each phase (e.g., `started`, `loaded`, `accepted`) is represented by a more specific
 *      state interface that extends `AutoeditBaseState` and adds phase-specific fields.
 *    - Valid transitions between phases are enforced using the `validSessionTransitions` map,
 *      ensuring logical progression through the session lifecycle.
 *
 * 2. **Metadata Evolution:**
 *    - Metadata is progressively enriched as the session transitions between states.
 *      For example, basic metadata like `languageId` and `model` is captured at the start,
 *      while detailed suggestion data (e.g., `charCount`, `prediction`) is added in later phases.
 *    - The `payload` field in each state encapsulates the relevant metadata, allowing for
 *      fine-grained tracking of session progress.
 *
 * 3. **Analytics Event Payloads:**
 *    - Events such as `suggested`, `accepted`, or `noResponse` are logged using the final
 *      metadata from the corresponding state.
 *    - Payload types like `AutoeditAcceptedEventPayload` or `AutoeditRejectedEventPayload`
 *      are constructed by combining state-specific metadata with additional analytics data.
 */

/**
 * Defines the possible phases of our autoedit session state machine.
 */
type Phase =
    | 'started'
    | 'contextLoaded'
    | 'loaded'
    | 'suggested'
    | 'accepted'
    | 'rejected'
    | 'noResponse'

/**
 * Defines which phases can transition to which other phases.
 */
const validSessionTransitions = {
    started: ['contextLoaded', 'noResponse'],
    contextLoaded: ['loaded', 'noResponse'],
    loaded: ['suggested'],
    suggested: ['accepted', 'rejected'],
    accepted: [],
    rejected: [],
    noResponse: [],
} as const satisfies Record<Phase, readonly Phase[]>

interface AutoeditStartedMetadata {
    /** Document language ID (e.g., 'typescript'). */
    languageId: string

    /** Model used by Cody client to request the autosuggestion suggestion. */
    model: string

    /** Optional trace ID for cross-service correlation, if your environment provides it. */
    traceId: string

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
     */
    prediction?: string

    /** The source of the suggestion, e.g. 'network', 'cache', etc. */
    source?: string

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
    /** True if the suggestion was explicitly/intentionally accepted */
    isAccepted: boolean
    /** The number of completions we requested until this one was suggested. */
    suggestionsStartedSinceLastSuggestion: number
}

interface AutoeditAcceptedEventPayload
    extends AutoEditFinalMetadata,
        Omit<CodeGenEventMetadata, 'charsInserted' | 'charsDeleted'> {}

interface AutoeditRejectedEventPayload extends AutoEditFinalMetadata {}
interface AutoeditNoResponseEventPayload extends AutoeditContextLoadedMetadata {}

/**
 * An ephemeral ID for a single “session” from creation to acceptance or rejection.
 */
export type AutoeditSessionID = string & { readonly _brand: 'AutoeditSessionID' }

/**
 * The base fields common to all session states. We track ephemeral times and
 * the partial payload. Once we reach a certain phase, we log the payload as a telemetry event.
 */
interface AutoeditBaseState {
    sessionId: AutoeditSessionID
    /** Current phase of the autoedit session */
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

interface NoResponseState extends Omit<StartedState, 'phase'> {
    phase: 'noResponse'
    /** Timestamp when the suggestion was logged to our analytics backend. This is to avoid double-logging. */
    suggestionLoggedAt?: number
    payload: AutoeditNoResponseEventPayload
}

interface PhaseStates {
    started: StartedState
    contextLoaded: ContextLoadedState
    loaded: LoadedState
    suggested: SuggestedState
    accepted: AcceptedState
    rejected: RejectedState
    noResponse: NoResponseState
}

/**
 * Using the validTransitions definition, we can derive which "from phases" lead to a given next phase,
 * and map that to the correct PhaseStates[fromPhase].
 */
type PreviousPossiblePhaseFrom<T extends Phase> = {
    [F in Phase]: T extends (typeof validSessionTransitions)[F][number] ? PhaseStates[F] : never
}[Phase]

type AutoeditSessionState = PhaseStates[Phase]

type AutoeditEventAction =
    | 'suggested'
    | 'accepted'
    | 'noResponse'
    | 'error'
    | `invalidTransitionTo${Capitalize<Phase>}`

/**
 * Specialized string type for referencing error messages in our rate-limiting map.
 */
type AutoeditErrorMessage = string & { readonly _brand: 'AutoeditErrorMessage' }

export class AutoeditAnalyticsLogger {
    /**
     * Stores ephemeral AutoeditSessionState for each session ID.
     */
    private activeSessions = new LRUCache<AutoeditSessionID, AutoeditSessionState>({ max: 20 })

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
     * Creates a new ephemeral session with initial metadata. At this stage, we do not have the prediction yet.
     */
    public createSession(
        payload: Pick<AutoeditStartedMetadata, 'languageId' | 'model' | 'traceId'>
    ): AutoeditSessionID {
        const sessionId = uuid.v4() as AutoeditSessionID
        const otherCompletionProviders = getOtherCompletionProvider()

        const session: StartedState = {
            sessionId,
            phase: 'started',
            startedAt: getTimeNowInMillis(),
            payload: {
                otherCompletionProviderEnabled: otherCompletionProviders.length > 0,
                otherCompletionProviders,
                upstreamLatency: upstreamHealthProvider.getUpstreamLatency(),
                gatewayLatency: upstreamHealthProvider.getGatewayLatency(),
                ...payload,
            },
        }

        this.activeSessions.set(sessionId, session)
        this.autoeditsStartedSinceLastSuggestion++
        return sessionId
    }

    public markAsContextLoaded({
        sessionId,
        payload,
    }: {
        sessionId: AutoeditSessionID
        payload: Pick<AutoeditContextLoadedMetadata, 'contextSummary'>
    }): void {
        this.tryTransitionTo(sessionId, 'contextLoaded', session => ({
            ...session,
            payload: {
                ...session.payload,
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
        sessionId,
        modelOptions,
        payload,
    }: {
        sessionId: AutoeditSessionID
        modelOptions: AutoeditModelOptions
        payload: Required<
            Pick<AutoeditLoadedMetadata, 'source' | 'isFuzzyMatch' | 'responseHeaders' | 'prediction'>
        >
    }): void {
        const { prediction, source, isFuzzyMatch, responseHeaders } = payload
        const stableId = this.suggestionIdRegistry.getOrCreate(modelOptions, prediction)
        const loadedAt = getTimeNowInMillis()

        this.tryTransitionTo(sessionId, 'loaded', session => ({
            ...session,
            loadedAt,
            payload: {
                ...session.payload,
                id: stableId,
                lineCount: lines(prediction).length,
                charCount: prediction.length,
                prediction: prediction.length < 300 ? prediction : undefined,
                source,
                isFuzzyMatch,
                responseHeaders,
                latency: loadedAt - session.startedAt,
            },
        }))
    }

    public markAsSuggested(sessionId: AutoeditSessionID): SuggestedState | null {
        const result = this.tryTransitionTo(sessionId, 'suggested', currentSession => ({
            ...currentSession,
            suggestedAt: getTimeNowInMillis(),
        }))

        if (!result) {
            return null
        }

        return result.updatedSession
    }

    public markAsAccepted({
        sessionId,
        trackedRange,
        position,
        document,
        prediction,
    }: {
        sessionId: AutoeditSessionID
        trackedRange?: vscode.Range
        position: vscode.Position
        document: vscode.TextDocument
        prediction: string
    }): void {
        const acceptedAt = getTimeNowInMillis()

        const result = this.tryTransitionTo(sessionId, 'accepted', session => {
            // Ensure the AutoeditSuggestionID is never reused by removing it from the suggestion id registry
            this.suggestionIdRegistry.deleteEntryIfValueExists(session.payload.id)

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
                ...session,
                acceptedAt,
                payload: {
                    ...session.payload,
                    ...charactersLoggerMetadata,
                    isAccepted: true,
                    displayDuration: acceptedAt - session.suggestedAt,
                    suggestionsStartedSinceLastSuggestion: this.autoeditsStartedSinceLastSuggestion,
                },
            }
        })

        if (result?.updatedSession) {
            this.writeAutoeditSessionEvent('suggested', result.updatedSession)
            this.writeAutoeditSessionEvent('accepted', result.updatedSession)
            this.activeSessions.delete(result.updatedSession.sessionId)
        }
    }

    public markAsRejected(sessionId: AutoeditSessionID): void {
        const result = this.tryTransitionTo(sessionId, 'rejected', session => ({
            ...session,
            payload: {
                ...session.payload,
                isAccepted: false,
                displayDuration: getTimeNowInMillis() - session.suggestedAt,
                suggestionsStartedSinceLastSuggestion: this.autoeditsStartedSinceLastSuggestion,
            },
        }))

        if (result?.updatedSession) {
            this.writeAutoeditSessionEvent('suggested', result.updatedSession)

            // Suggestions are kept in the LRU cache for longer. This is because they
            // can still become visible if e.g. they are served from the cache and we
            // need to retain the ability to mark them as seen.
        }
    }

    /**
     * If the suggestion was never provided at all (“noResponse”), treat as a specialized reject.
     */
    public markAsNoResponse(sessionId: AutoeditSessionID): void {
        const result = this.tryTransitionTo(sessionId, 'noResponse', currentSession => currentSession)

        if (result?.updatedSession) {
            this.writeAutoeditSessionEvent('noResponse', result.updatedSession)
            this.activeSessions.delete(result.updatedSession.sessionId)
        }
    }

    private tryTransitionTo<P extends Phase>(
        sessionId: AutoeditSessionID,
        nextPhase: P,
        patch: (currentSession: PreviousPossiblePhaseFrom<P>) => Omit<PhaseStates[P], 'phase'>
    ): { currentSession: PreviousPossiblePhaseFrom<P>; updatedSession: PhaseStates[P] } | null {
        const currentSession = this.getSessionIfReadyForNextPhase(sessionId, nextPhase)

        if (!currentSession) {
            return null
        }

        const updatedSession = {
            ...currentSession,
            ...patch(currentSession),
            phase: nextPhase,
        } as PhaseStates[P]

        this.activeSessions.set(sessionId, updatedSession)
        return { updatedSession, currentSession }
    }

    /**
     * Retrieves the session if it is in a phase that can transition to nextPhase,
     * returning null if not found or if the transition is invalid. Uses the derived
     * PreviousPossiblePhaseFrom type so that the returned State has the correct fields.
     */
    private getSessionIfReadyForNextPhase<T extends Phase>(
        sessionId: AutoeditSessionID,
        nextPhase: T
    ): PreviousPossiblePhaseFrom<T> | null {
        const session = this.activeSessions.get(sessionId)

        if (
            !session ||
            !(validSessionTransitions[session.phase] as readonly Phase[]).includes(nextPhase)
        ) {
            this.writeDebugBookkeepingEvent(
                `invalidTransitionTo${capitalize(nextPhase) as Capitalize<Phase>}`
            )

            return null
        }

        return session as PreviousPossiblePhaseFrom<T>
    }

    private writeAutoeditSessionEvent(
        action: AutoeditEventAction,
        state: AcceptedState | RejectedState | NoResponseState
    ): void {
        if (action === 'suggested' && state.suggestionLoggedAt) {
            return
        }

        // Update the session state to mark the suggestion as logged.
        state.suggestionLoggedAt = getTimeNowInMillis()

        const { metadata, privateMetadata } = splitSafeMetadata(state.payload)
        this.writeAutoeditEvent(action, {
            version: 0,
            metadata,
            privateMetadata,
            billingMetadata: {
                product: 'cody',
                // TODO: double check with the analytics team
                // whether we should be categorizing the different completion event types.
                category: action === 'suggested' ? 'billable' : 'core',
            },
        })

        // Reset the number of the auto-edits started since the last suggestion.
        this.autoeditsStartedSinceLastSuggestion = 0
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

function getTimeNowInMillis(): number {
    return Math.floor(performance.now())
}
