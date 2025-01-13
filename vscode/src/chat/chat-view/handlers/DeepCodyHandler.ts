import {
    type ContextItem,
    FeatureFlag,
    type ProcessingStep,
    type SerializedPromptEditorState,
    featureFlagProvider,
    storeLastValue,
} from '@sourcegraph/cody-shared'
import { DeepCodyAgent } from '../../agentic/DeepCody'
import { DeepCodyRateLimiter } from '../../agentic/DeepCodyRateLimiter'
import type { ChatBuilder } from '../ChatBuilder'
import type { HumanInput } from '../context'
import { ChatHandler } from './ChatHandler'
import type { AgentHandler, AgentHandlerDelegate } from './interfaces'

export class DeepCodyHandler extends ChatHandler implements AgentHandler {
    private featureDeepCodyRateLimitBase = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.DeepCodyRateLimitBase)
    )
    private featureDeepCodyRateLimitMultiplier = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.DeepCodyRateLimitMultiplier)
    )
    private featureDeepCodySessionLimit = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.DeepCodyRateSessionLimit)
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
        // NOTE: Skip query rewrite for deep-cody as the agent will reviewed and rewrite the query.
        const skipQueryRewrite = true
        const baseContextResult = await super.computeContext(
            requestID,
            { text, mentions },
            editorState,
            chatBuilder,
            delegate,
            signal,
            skipQueryRewrite
        )
        const isEnabled = chatBuilder.selectedAgent === 'deep-cody'
        if (!isEnabled || baseContextResult.error || baseContextResult.abort) {
            return baseContextResult
        }

        // Skip deep-cody if the query is too short.
        const wordsCount = text.split(' ').length
        // Only runs deep-cody for the first 5 human messages if the session limit flag is enabled.
        // NOTE: Times 2 as the human and agent messages are counted as pair.
        const isSessionLimitFlagEnabled = this.featureDeepCodySessionLimit.value.last
        const isAtSessionLimit = (chatBuilder.getLastSpeakerMessageIndex('human') ?? 0) > 5 * 2
        if (wordsCount < 3 || (isSessionLimitFlagEnabled && isAtSessionLimit)) {
            return baseContextResult
        }

        const deepCodyRateLimiter = new DeepCodyRateLimiter(
            this.featureDeepCodyRateLimitBase.value.last ? 50 : 0,
            this.featureDeepCodyRateLimitMultiplier.value.last ? 4 : 2
        )

        const deepCodyLimit = deepCodyRateLimiter.isAtLimit()
        if (isEnabled && deepCodyLimit) {
            chatBuilder.setSelectedAgent(undefined)
            return { error: deepCodyRateLimiter.getRateLimitError(deepCodyLimit), abort: true }
        }

        const baseContext = baseContextResult.contextItems ?? []
        const agent = new DeepCodyAgent(chatBuilder, this.chatClient, (steps: ProcessingStep[]) =>
            delegate.postStatuses(steps)
        )

        return { contextItems: await agent.getContext(requestID, signal, baseContext) }
    }
}
