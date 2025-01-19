import {
    type ContextItem,
    FeatureFlag,
    type ProcessingStep,
    type SerializedPromptEditorState,
    featureFlagProvider,
    storeLastValue,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import { OmniboxHandlers } from '@sourcegraph/cody-shared/src/models/model'
import { DeepCodyAgent } from '../../agentic/DeepCody'
import { DeepCodyRateLimiter } from '../../agentic/DeepCodyRateLimiter'
import type { ChatBuilder } from '../ChatBuilder'
import type { HumanInput } from '../context'
import { ChatHandler } from './ChatHandler'
import type { AgentHandler, AgentHandlerDelegate } from './interfaces'

// NOTE: Skip query rewrite for Deep Cody as it will be done during review step.
const skipQueryRewriteForDeepCody = true

export class DeepCodyHandler extends ChatHandler implements AgentHandler {
    private featureDeepCodyRateLimitBase = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.DeepCodyRateLimitBase)
    )
    private featureDeepCodyRateLimitMultiplier = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.DeepCodyRateLimitMultiplier)
    )
    private featureSessionLimit = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.AgenticContextSessionLimit)
    )

    override async computeContext(
        requestID: string,
        { text, mentions }: HumanInput,
        editorState: SerializedPromptEditorState | null,
        chatBuilder: ChatBuilder,
        delegate: AgentHandlerDelegate,
        signal: AbortSignal
    ): Promise<{
        contextItems?: ContextItem[]
        error?: Error
        abort?: boolean
    }> {
        const baseContextResult = await super.computeContext(
            requestID,
            { text, mentions },
            editorState,
            chatBuilder,
            delegate,
            signal,
            skipQueryRewriteForDeepCody
        )
        // Early return if basic conditions aren't met.
        if (
            chatBuilder.selectedAgent !== OmniboxHandlers.DeepCody.id ||
            baseContextResult.error ||
            baseContextResult.abort
        ) {
            return baseContextResult
        }
        // Check session and query constraints
        const queryTooShort = text.split(' ').length < 3
        // Limits to the first 5 human messages if the session limit flag is enabled.
        // NOTE: Times 2 as the human and agent messages are counted as pair.
        const sessionLimitReached = (chatBuilder.getLastSpeakerMessageIndex('human') ?? 0) > 5 * 2
        // Skip if the query is too short or the session limit is reached.
        if (queryTooShort || (this.featureSessionLimit.value.last && sessionLimitReached)) {
            const limitType = queryTooShort ? 'skipped' : 'hit'
            telemetryRecorder.recordEvent('cody.agentic-chat.sessionLimit', limitType, {
                billingMetadata: {
                    product: 'cody',
                    category: 'billable',
                },
            })
            return baseContextResult
        }

        const deepCodyRateLimiter = new DeepCodyRateLimiter(
            this.featureDeepCodyRateLimitBase.value.last ? 50 : 0,
            this.featureDeepCodyRateLimitMultiplier.value.last ? 4 : 2
        )

        const retryTime = deepCodyRateLimiter.isAtLimit()
        if (retryTime) {
            chatBuilder.setSelectedAgent(undefined)
            return { error: deepCodyRateLimiter.getRateLimitError(retryTime), abort: true }
        }

        const baseContext = baseContextResult.contextItems ?? []
        const agent = new DeepCodyAgent(
            chatBuilder,
            this.chatClient,
            (steps: ProcessingStep[]) => delegate.postStatuses(steps),
            (step: ProcessingStep) => delegate.postRequest(step)
        )

        return { contextItems: await agent.getContext(requestID, signal, baseContext) }
    }
}
