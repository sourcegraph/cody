import { type CodebaseContext } from '../../codebase-context'
import {
    createContextMessageByFile,
    getContextMessageWithResponse,
    type ContextFile,
    type ContextMessage,
} from '../../codebase-context/messages'
import { type ActiveTextEditorSelection, type Editor } from '../../editor'
import { type IntentDetector } from '../../intent-detector'
import { MAX_CURRENT_FILE_TOKENS, MAX_HUMAN_INPUT_TOKENS } from '../../prompt/constants'
import {
    populateCurrentEditorContextTemplate,
    populateCurrentEditorSelectedContextTemplate,
} from '../../prompt/templates'
import { truncateText } from '../../prompt/truncation'
import { Interaction } from '../transcript/interaction'

import { isSingleWord, numResults } from './helpers'
import { type Recipe, type RecipeContext, type RecipeID } from './recipe'

export class ChatQuestion implements Recipe {
    public id: RecipeID = 'chat-question'
    public title = 'Chat Question'

    constructor(private debug: (filterLabel: string, text: string, ...args: unknown[]) => void) {}

    public async getInteraction(humanChatInput: string, context: RecipeContext): Promise<Interaction | null> {
        const source = this.id
        const truncatedText = truncateText(humanChatInput, MAX_HUMAN_INPUT_TOKENS)

        const displayText = humanChatInput

        return Promise.resolve(
            new Interaction(
                { speaker: 'human', text: truncatedText, displayText, metadata: { source } },
                { speaker: 'assistant', metadata: { source } },
                this.getContextMessages(
                    truncatedText,
                    context.editor,
                    context.addEnhancedContext,
                    context.intentDetector,
                    context.codebaseContext,
                    context.editor.getActiveTextEditorSelection() || null,
                    context.userInputContextFiles
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
        selection: ActiveTextEditorSelection | null,
        contextFiles?: ContextFile[]
    ): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []
        // Unless context files are provided, we don't need to add any context
        // If input is less than 2 words, it means it's most likely a statement or a follow-up question that does not require additional context
        // e,g. "hey", "hi", "why", "explain" etc.
        const isTextTooShort = isSingleWord(text)
        if (isTextTooShort) {
            if (!contextFiles?.length) {
                return contextMessages
            }
            return ChatQuestion.getContextFilesContext(editor, contextFiles)
        }

        this.debug('ChatQuestion:getContextMessages', 'addEnhancedContext', addEnhancedContext)
        if (addEnhancedContext) {
            const codebaseContextMessages = await codebaseContext.getCombinedContextMessages(text, numResults)
            contextMessages.push(...codebaseContextMessages)
        }
        const isEditorContextRequired = intentDetector.isEditorContextRequired(text)
        this.debug('ChatQuestion:getContextMessages', 'isEditorContextRequired', isEditorContextRequired)
        if (isEditorContextRequired) {
            contextMessages.push(...ChatQuestion.getEditorContext(editor))
        }

        if (contextFiles?.length) {
            const contextFileMessages = await ChatQuestion.getContextFilesContext(editor, contextFiles)
            contextMessages.push(...contextFileMessages)
        }

        // Add selected text as context when available
        if (selection?.selectedText) {
            contextMessages.push(...ChatQuestion.getEditorSelectionContext(selection))
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

    public static async getContextFilesContext(editor: Editor, contextFiles: ContextFile[]): Promise<ContextMessage[]> {
        const contextFileMessages = []
        for (const file of contextFiles) {
            if (file?.uri) {
                const content = await editor.getTextEditorContentForFile(file?.uri, file.range)
                console.log(content, file.uri.fsPath)
                if (content) {
                    const message = createContextMessageByFile(file, content)
                    contextFileMessages.push(...message)
                }
            }
        }
        return contextFileMessages
    }
}
