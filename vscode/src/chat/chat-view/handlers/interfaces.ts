import type { Span } from '@opentelemetry/api'
import type {
    ChatMessage,
    ContextItem,
    PromptString,
    SerializedPromptEditorState,
} from '@sourcegraph/cody-shared'
import type { MessageErrorType } from '../../MessageProvider'
import type { CodyToolProvider } from '../../agentic/CodyToolProvider'
import type { ChatBuilder } from '../ChatBuilder'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'
import type { AgentTelemetry } from './AgentTelemetry'

export interface AgentTools {
    contextRetriever: Pick<ContextRetriever, 'retrieveContext'>
    editor: ChatControllerOptions['editor']
    chatClient: ChatControllerOptions['chatClient']
    codyToolProvider: CodyToolProvider
}

/**
 * Interface for the agent to post messages back to the user
 */
export interface AgentHandlerDelegate {
    postError(error: Error, type?: MessageErrorType): void
    postMessageInProgress(message: ChatMessage): void
    postDone(ops?: { abort: boolean }): void
}

export interface AgentRequest {
    requestID: string
    inputText: PromptString
    mentions: ContextItem[]
    editorState: SerializedPromptEditorState | null
    chatBuilder: ChatBuilder
    signal: AbortSignal
    span: Span
    recorder: AgentTelemetry
}

export interface AgentHandler {
    handle(request: AgentRequest, delegate: AgentHandlerDelegate): Promise<void>
}
