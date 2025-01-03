import {
    type ContextItem,
    FeatureFlag,
    type ProcessingStep,
    type SerializedPromptEditorState,
    featureFlagProvider,
    storeLastValue,
} from '@sourcegraph/cody-shared'
import { CodyToolProvider } from '../../agentic/CodyToolProvider'
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
        CodyToolProvider.initialize(this.contextRetriever)

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
        const isEnabled = chatBuilder.getMessages().length < 4
        if (!isEnabled || baseContextResult.error || baseContextResult.abort) {
            return baseContextResult
        }
        const deepCodyRateLimiter = new DeepCodyRateLimiter(
            this.featureDeepCodyRateLimitBase.value.last ? 50 : 0,
            this.featureDeepCodyRateLimitMultiplier.value.last ? 2 : 1
        )

        const deepCodyLimit = deepCodyRateLimiter.isAtLimit()
        if (isEnabled && deepCodyLimit) {
            return { error: deepCodyRateLimiter.getRateLimitError(deepCodyLimit), abort: true }
        }

        const baseContext = baseContextResult.contextItems ?? []
        const agent = new DeepCodyAgent(chatBuilder, this.chatClient, (steps: ProcessingStep[]) =>
            delegate.postStatuses(steps)
        )

        return { contextItems: await agent.getContext(requestID, signal, baseContext) }
    }
}
