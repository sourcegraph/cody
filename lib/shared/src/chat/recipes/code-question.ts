import { type CodebaseContext } from '../../codebase-context'
import { getContextMessageWithResponse, type ContextMessage } from '../../codebase-context/messages'
import { type ActiveTextEditorSelection, type Editor } from '../../editor'
import { type IntentDetector } from '../../intent-detector'
import { MAX_CURRENT_FILE_TOKENS, MAX_HUMAN_INPUT_TOKENS } from '../../prompt/constants'
import {
    populateCurrentEditorContextTemplate,
    populateCurrentEditorSelectedContextTemplate,
} from '../../prompt/templates'
import { truncateText } from '../../prompt/truncation'
import { Interaction } from '../transcript/interaction'

import { getFileExtension, isSingleWord, numResults } from './helpers'
import { type Recipe, type RecipeContext, type RecipeID } from './recipe'

export class CodeQuestion implements Recipe {
    public id: RecipeID = 'code-question'
    public title = 'Code Question'

    constructor(private debug: (filterLabel: string, text: string, ...args: unknown[]) => void) {}

    public async getInteraction(humanChatInput: string, context: RecipeContext): Promise<Interaction | null> {
        const source = this.id
        const truncatedText = truncateText(humanChatInput, MAX_HUMAN_INPUT_TOKENS)

        return Promise.resolve(
            new Interaction(
                { speaker: 'human', text: truncatedText, displayText: humanChatInput, metadata: { source } },
                {
                    speaker: 'assistant',
                    text: `\`\`\`${getFileExtension(context.editor.getActiveTextEditorSelection()?.fileUri ?? '')}\n`,
                    metadata: { source },
                },
                this.getContextMessages(
                    truncatedText,
                    context.editor,
                    context.addEnhancedContext,
                    context.intentDetector,
                    context.codebaseContext,
                    context.editor.getActiveTextEditorSelection() || null
                ),
                []
            )
        )
    }

    private async getContextMessages(
        text: string,
        editor: Editor,
        addEnhancedContext: boolean,
        intentDetector: IntentDetector,
        codebaseContext: CodebaseContext,
        selection: ActiveTextEditorSelection | null
    ): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []
        // If input is less than 2 words, it means it's most likely a statement or a follow-up question that does not require additional context
        // e,g. "hey", "hi", "why", "explain" etc.
        const isTextTooShort = isSingleWord(text)
        if (isTextTooShort) {
            return contextMessages
        }

        const isCodebaseContextRequired = addEnhancedContext || (await intentDetector.isCodebaseContextRequired(text))

        this.debug('ChatQuestion:getContextMessages', 'isCodebaseContextRequired', isCodebaseContextRequired)
        if (isCodebaseContextRequired) {
            const codebaseContextMessages = await codebaseContext.getContextMessages(text, numResults)
            contextMessages.push(...codebaseContextMessages)
        }

        const isEditorContextRequired = intentDetector.isEditorContextRequired(text)
        this.debug('ChatQuestion:getContextMessages', 'isEditorContextRequired', isEditorContextRequired)
        if (isCodebaseContextRequired || isEditorContextRequired) {
            contextMessages.push(...CodeQuestion.getEditorContext(editor))
        }

        // Add selected text as context when available
        if (selection?.selectedText) {
            contextMessages.push(...CodeQuestion.getEditorSelectionContext(selection))
        }

        return contextMessages
    }

    public static getEditorContext(editor: Editor): ContextMessage[] {
        const visibleContent = editor.getActiveTextEditorVisibleContent()
        if (!visibleContent) {
            return []
        }
        const truncatedContent = truncateText(visibleContent.content, MAX_CURRENT_FILE_TOKENS)
        return getContextMessageWithResponse(
            populateCurrentEditorContextTemplate(truncatedContent, visibleContent.fileUri, visibleContent.repoName),
            {
                type: 'file',
                uri: visibleContent.fileUri,
                repoName: visibleContent.repoName,
                revision: visibleContent.revision,
            }
        )
    }

    public static getEditorSelectionContext(selection: ActiveTextEditorSelection): ContextMessage[] {
        const truncatedContent = truncateText(selection.selectedText, MAX_CURRENT_FILE_TOKENS)
        return getContextMessageWithResponse(
            populateCurrentEditorSelectedContextTemplate(truncatedContent, selection.fileUri, selection.repoName),
            {
                type: 'file',
                uri: selection.fileUri,
                repoName: selection.repoName,
                revision: selection.revision,
            }
        )
    }
}
