import type { ContextItem, ProcessingStep, SerializedPromptEditorState } from '@sourcegraph/cody-shared'
import { DeepCodyAgent } from '../../agentic/DeepCody'
import { toolboxManager } from '../../agentic/ToolboxManager'
import type { ChatBuilder } from '../ChatBuilder'
import type { HumanInput } from '../context'
import { ChatHandler } from './ChatHandler'
import type { AgentHandler, AgentHandlerDelegate } from './interfaces'

// NOTE: Skip query rewrite for Deep Cody as it will be done during review step.
const skipQueryRewriteForDeepCody = true

export class DeepCodyHandler extends ChatHandler implements AgentHandler {
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
            !toolboxManager.isAgenticChatEnabled() ||
            baseContextResult.error ||
            baseContextResult.abort
        ) {
            return baseContextResult
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
