import {
    type ContextItem,
    FeatureFlag,
    type SerializedPromptEditorState,
    featureFlagProvider,
    storeLastValue,
} from '@sourcegraph/cody-shared'
import type { CodyToolProvider } from '../../agentic/CodyToolProvider'
import { DeepCodyAgent } from '../../agentic/DeepCody'
import { DeepCodyRateLimiter } from '../../agentic/DeepCodyRateLimiter'
import type { ChatBuilder } from '../ChatBuilder'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'
import type { HumanInput } from '../context'
import { ChatHandler } from './ChatHandler'
import type { AgentHandler } from './interfaces'

export class ContextAgentHandler extends ChatHandler implements AgentHandler {
    constructor(
        modelId: string,
        contextRetriever: Pick<ContextRetriever, 'retrieveContext'>,
        editor: ChatControllerOptions['editor'],
        chatClient: ChatControllerOptions['chatClient'],
        private toolProvider: CodyToolProvider
    ) {
        super(modelId, contextRetriever, editor, chatClient)
    }

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
            signal
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
        const agenticContext = await new DeepCodyAgent(
            chatBuilder,
            this.chatClient,
            this.toolProvider.getTools(),
            baseContext
        ).getContext(requestID, signal)
        return { contextItems: [...baseContext, ...agenticContext] }
    }
}
