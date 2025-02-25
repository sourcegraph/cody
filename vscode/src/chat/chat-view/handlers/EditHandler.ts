import {
    DefaultEditCommands,
    PromptString,
    inputTextWithoutContextChipsFromPromptEditorState,
} from '@sourcegraph/cody-shared'
import { executeCodyCommand } from '../../../commands/CommandsController'
import { diffInChat } from '../../diff'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'
import { computeContextAlternatives } from './ChatHandler'
import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'

export class EditHandler implements AgentHandler {
    constructor(
        private mode: 'edit' | 'insert',
        private contextRetriever: Pick<ContextRetriever, 'retrieveContext'>,
        private readonly editor: ChatControllerOptions['editor']
    ) {}

    async handle(
        {
            requestID,
            inputText,
            mentions,
            editorState,
            span,
            signal,
            chatBuilder,
            recorder,
        }: AgentRequest,
        delegate: AgentHandlerDelegate
    ): Promise<void> {
        chatBuilder.setLastMessageIntent('edit')
        const contextAlternatives = await computeContextAlternatives(
            this.contextRetriever,
            this.editor,
            { text: inputText, mentions },
            editorState,
            span,
            signal
        )
        signal.throwIfAborted()
        const context = contextAlternatives[0].items

        chatBuilder.setLastMessageContext(context, contextAlternatives)

        const inputTextWithoutContextChips = editorState
            ? PromptString.unsafe_fromUserQuery(
                  inputTextWithoutContextChipsFromPromptEditorState(editorState)
              )
            : inputText

        recorder.recordChatQuestionExecuted(context, { addMetadata: true, current: span })

        const result = await executeCodyCommand(DefaultEditCommands.Edit, {
            requestID,
            runInChatMode: true,
            userContextFiles: context,
            configuration: {
                instruction: inputTextWithoutContextChips,
                mode: this.mode,
                // Only document code uses non-edit (insert mode), set doc intent for Document code prompt
                // to specialize cody command runner for document code case.
                intent: this.mode === 'edit' ? 'edit' : 'doc',
            },
        })
        if (result?.type !== 'edit' || !result.task) {
            delegate.postError(new Error('Failed to execute edit command'), 'transcript')
            delegate.postDone()
            return
        }

        const { diff, replacement, document, originalRange } = result.task
        const diffs = diff ?? [{ type: 'insertion', text: replacement ?? '', range: originalRange }]
        const message = diffInChat(diffs, document, { showFullFile: false })

        delegate.postMessageInProgress({
            speaker: 'assistant',
            text: PromptString.unsafe_fromLLMResponse(message),
        })

        delegate.postDone()
    }
}
