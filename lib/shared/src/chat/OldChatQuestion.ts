import { type CodebaseContext } from '../codebase-context'
import {
    createContextMessageByFile,
    getContextMessageWithResponse,
    type ContextFile,
    type ContextMessage,
} from '../codebase-context/messages'
import { type ActiveTextEditorSelection, type Editor } from '../editor'
import { type IntentDetector } from '../intent-detector'
import {
    MAX_CURRENT_FILE_TOKENS,
    MAX_HUMAN_INPUT_TOKENS,
    NUM_CODE_RESULTS,
    NUM_TEXT_RESULTS,
} from '../prompt/constants'
import { populateCurrentEditorContextTemplate, populateCurrentEditorSelectedContextTemplate } from '../prompt/templates'
import { truncateText } from '../prompt/truncation'

import { type BotResponseMultiplexer } from './bot-response-multiplexer'
import { Interaction } from './transcript/interaction'

export interface ChatQuestionContext {
    editor: Editor
    intentDetector: IntentDetector
    codebaseContext: CodebaseContext
    responseMultiplexer?: BotResponseMultiplexer
    addEnhancedContext: boolean
    userInputContextFiles?: ContextFile[]
}

/**
 * A legacy chat implementation from the pre-November 2023 (version 0.18.0) world. This used to be
 * the ChatQuestion recipe. It is only used by e2e and unit tests.
 */
export class OldChatQuestion {
    constructor(private debug: (filterLabel: string, text: string, ...args: unknown[]) => void) {}

    public async getInteraction(humanChatInput: string, context: ChatQuestionContext): Promise<Interaction | null> {
        const truncatedText = truncateText(humanChatInput, MAX_HUMAN_INPUT_TOKENS)

        const displayText = humanChatInput

        return Promise.resolve(
            new Interaction(
                { speaker: 'human', text: truncatedText, displayText },
                { speaker: 'assistant' },
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
            return OldChatQuestion.getContextFilesContext(editor, contextFiles)
        }

        this.debug('ChatQuestion:getContextMessages', 'addEnhancedContext', addEnhancedContext)
        if (addEnhancedContext) {
            const codebaseContextMessages = await codebaseContext.getCombinedContextMessages(text, numResults)
            contextMessages.push(...codebaseContextMessages)
        }
        const isEditorContextRequired = intentDetector.isEditorContextRequired(text)
        this.debug('ChatQuestion:getContextMessages', 'isEditorContextRequired', isEditorContextRequired)
        if (isEditorContextRequired) {
            contextMessages.push(...OldChatQuestion.getEditorContext(editor))
        }

        if (contextFiles?.length) {
            const contextFileMessages = await OldChatQuestion.getContextFilesContext(editor, contextFiles)
            contextMessages.push(...contextFileMessages)
        }

        // Add selected text as context when available
        if (selection?.selectedText) {
            contextMessages.push(...OldChatQuestion.getEditorSelectionContext(selection))
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

const numResults = {
    numCodeResults: NUM_CODE_RESULTS,
    numTextResults: NUM_TEXT_RESULTS,
}

function isSingleWord(str: string): boolean {
    return str.trim().split(/\s+/).length === 1
}
