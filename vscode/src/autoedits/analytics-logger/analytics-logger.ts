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
import { lines } from '../../completions/text-processing'
import { charactersLogger } from '../../services/CharactersLogger'
import { upstreamHealthProvider } from '../../services/UpstreamHealthProvider'
import { captureException, shouldErrorBeReported } from '../../services/sentry/sentry'
import { splitSafeMetadata } from '../../services/telemetry-v2'
import type { AutoeditsPrompt, ModelResponse } from '../adapters/base'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { CodeToReplaceData } from '../prompt/prompt-utils'
import type { DecorationInfo } from '../renderer/decorators/base'
import { getDecorationStats } from '../renderer/diff-utils'

import { autoeditDebugStore } from '../debug-panel/debug-store'
import type { AutoEditRenderOutput } from '../renderer/render-output'
import { autoeditIdRegistry } from './suggestion-id-registry'
import {
    type AcceptedState,
    type AutoeditDiscardReasonMetadata,
    type AutoeditRequestID,
    type ContextLoadedState,
    type DiscardedState,
    type LoadedState,
    type Phase,
    type PhaseStates,
    type RejectedState,
    type StartedState,
    type SuggestedState,
    validRequestTransitions,
} from './types'

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
            Pick<StartedState['payload'], 'languageId' | 'model' | 'triggerKind' | 'codeToRewrite'>
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
        payload: Pick<ContextLoadedState['payload'], 'contextSummary'>
    }): void {
        this.tryTransitionTo(requestId, 'contextLoaded', request => ({
            ...request,
            contextLoadedAt: getTimeNowInMillis(),
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
        modelResponse,
    }: {
        modelResponse: ModelResponse
        requestId: AutoeditRequestID
        prompt: AutoeditsPrompt
        payload: Required<Pick<LoadedState['payload'], 'source' | 'isFuzzyMatch' | 'prediction'>>
    }): void {
        const { prediction, source, isFuzzyMatch } = payload
        const stableId = autoeditIdRegistry.getOrCreate(prompt, prediction)
        const loadedAt = getTimeNowInMillis()

        this.tryTransitionTo(requestId, 'loaded', request => {
            return {
                ...request,
                loadedAt,
                modelResponse,
                payload: {
                    ...request.payload,
                    id: stableId,
                    // 🚨 SECURITY: included only for DotCom users.
                    prediction: isDotComAuthed() && prediction.length < 300 ? prediction : undefined,
                    source,
                    isFuzzyMatch,
                    responseHeaders: modelResponse.responseHeaders,
                    latency: Math.floor(loadedAt - request.startedAt),
                },
            }
        })
    }

    public markAsPostProcessed({
        requestId,
        decorationInfo,
        prediction,
        renderOutput,
    }: {
        requestId: AutoeditRequestID
        prediction: string
        decorationInfo: DecorationInfo | null
        renderOutput: AutoEditRenderOutput
    }) {
        this.tryTransitionTo(requestId, 'postProcessed', request => {
            const completion =
                'inlineCompletionItems' in renderOutput
                    ? renderOutput.inlineCompletionItems[0]
                    : undefined
            const insertText = completion
                ? (completion.insertText as string).slice(request.docContext.currentLinePrefix.length)
                : undefined

            return {
                ...request,
                postProcessedAt: getTimeNowInMillis(),
                prediction,
                renderOutput,
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
        const rejectedAt = getTimeNowInMillis()

        const result = this.tryTransitionTo(requestId, 'rejected', request => ({
            ...request,
            rejectedAt,
            payload: {
                ...request.payload,
                isAccepted: false,
                isRead: 'readAt' in request,
                timeFromSuggestedAt: rejectedAt - request.suggestedAt,
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
                discardedAt: getTimeNowInMillis(),
                payload: {
                    ...request.payload,
                    discardReason,
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

        // Integrate auto-edit analytics logger with the auto-edit debug panel.
        autoeditDebugStore.addAutoeditRequestDebugState(updatedRequest)

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
