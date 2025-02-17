import type { Span } from '@opentelemetry/api'
import type {
    ChatMessage,
    ContextItem,
    ProcessingStep,
    PromptString,
    SerializedPromptEditorState,
} from '@sourcegraph/cody-shared'
import type { SubMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import type { MessageErrorType } from '../../MessageProvider'
import type { ChatBuilder } from '../ChatBuilder'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'
import type { OmniboxTelemetry } from './OmniboxTelemetry'

export interface AgentTools {
    contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>
    editor: ChatControllerOptions['editor']
    chatClient: ChatControllerOptions['chatClient']
}

/**
 * Interface for the handler to post messages back to the user
 */
export interface OmniboxHandlerDelegate {
    postError(error: Error, type?: MessageErrorType): void
    postStatuses(steps: ProcessingStep[]): void
    postMessageInProgress(message: ChatMessage): void
    postRequest(step: ProcessingStep): Promise<boolean>
    postDone(ops?: { abort: boolean }): void

    /**
     * An experimental way to post updates to the message in progress.
     *
     * NOTE: A given OmniboxHandler implementation should use either this
     * method or `postMessageInProgress` but not both.
     */
    experimentalPostMessageInProgress(subMessages: SubMessage[]): void
}

export interface OmniboxRequest {
    requestID: string
    inputText: PromptString
    mentions: ContextItem[]
    editorState: SerializedPromptEditorState | null
    chatBuilder: ChatBuilder
    signal: AbortSignal
    span: Span
    recorder: OmniboxTelemetry
}

export interface OmniboxHandler {
    handle(request: OmniboxRequest, delegate: OmniboxHandlerDelegate): Promise<void>
}
