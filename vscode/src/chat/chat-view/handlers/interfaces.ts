import type { ContextItem, PromptString, SerializedPromptEditorState } from '@sourcegraph/cody-shared'
import type { MessageErrorType } from '../../MessageProvider'
import type { ChatBuilder } from '../ChatBuilder'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'

export interface AgentTools {
    contextRetriever: Pick<ContextRetriever, 'retrieveContext'>
    editor: ChatControllerOptions['editor']
    chatClient: ChatControllerOptions['chatClient']
}

/**
 * Interface for the agent to post messages back to the user
 */
export interface AgentHandlerDelegate {
    postStatusUpdate(id: number, type: string, statusMessage: string): void
    postError(error: Error, type?: MessageErrorType): void
    postStatement(id: number, message: PromptString): void
    postDone(): void
}

export interface AgentRequest {
    chatClient: ChatControllerOptions['chatClient']

    inputText: PromptString
    mentions: ContextItem[]
    editorState: SerializedPromptEditorState | null
    chatBuilder: ChatBuilder
    signal: AbortSignal
}

export interface AgentHandler {
    handle(request: AgentRequest, delegate: AgentHandlerDelegate): Promise<void>
}
