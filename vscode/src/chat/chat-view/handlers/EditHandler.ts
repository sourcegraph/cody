import {
    DefaultEditCommands,
    PromptString,
    inputTextWithoutContextChipsFromPromptEditorState,
} from '@sourcegraph/cody-shared'
import { executeCodyCommand } from '../../../commands/CommandsController'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'
import { computeContextAlternatives } from './ChatHandler'
import type { OmniboxHandler, OmniboxHandlerDelegate, OmniboxRequest } from './interfaces'

export class EditHandler implements OmniboxHandler {
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
        }: OmniboxRequest,
        delegate: OmniboxHandlerDelegate
    ): Promise<void> {
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

        const task = result.task

        let responseMessage = `Here is the response for the ${task.intent} instruction:\n`

        if (!task.diff && task.replacement) {
            task.diff = [
                {
                    type: 'insertion',
                    text: task.replacement,
                    range: task.originalRange,
                },
            ]
        }

        task.diff?.map(diff => {
            responseMessage += '\n```diff\n'
            if (diff.type === 'deletion') {
                responseMessage += task.document
                    .getText(diff.range)
                    .split('\n')
                    .map(line => `- ${line}`)
                    .join('\n')
            }
            if (diff.type === 'decoratedReplacement') {
                responseMessage += diff.oldText
                    .split('\n')
                    .map(line => `- ${line}`)
                    .join('\n')
                responseMessage += diff.text
                    .split('\n')
                    .map(line => `+ ${line}`)
                    .join('\n')
            }
            if (diff.type === 'insertion') {
                responseMessage += diff.text
                    .split('\n')
                    .map(line => `+ ${line}`)
                    .join('\n')
            }
            responseMessage += '\n```'
        })

        delegate.postMessageInProgress({
            speaker: 'assistant',
            text: PromptString.unsafe_fromLLMResponse(responseMessage),
        })
        delegate.postDone()
    }
}
