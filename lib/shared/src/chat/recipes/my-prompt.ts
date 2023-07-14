import * as vscode from 'vscode'

import { CodebaseContext } from '../../codebase-context'
import { ContextMessage, getContextMessageWithResponse } from '../../codebase-context/messages'
import { ActiveTextEditorSelection, Editor } from '../../editor'
import { MAX_CURRENT_FILE_TOKENS, MAX_HUMAN_INPUT_TOKENS } from '../../prompt/constants'
import { populateCurrentEditorContextTemplate, populateTerminalOutputContextTemplate } from '../../prompt/templates'
import { truncateText } from '../../prompt/truncation'
import { Interaction } from '../transcript/interaction'

import { ChatQuestion } from './chat-question'
import { InlineTouch } from './inline-touch'
import { Recipe, RecipeContext, RecipeID } from './recipe'

/** ======================================================
 * Recipe for running custom prompts from the cody.json files
====================================================== **/
export class MyPrompt implements Recipe {
    public id: RecipeID = 'my-prompt'
    private promptStore = new Map<string, string>()

    public async getInteraction(humanChatInput: string, context: RecipeContext): Promise<Interaction | null> {
        const selection = context.editor.getActiveTextEditorSelection() || context.editor.controllers?.inline.selection

        // Make prompt text
        const humanInput = humanChatInput.trim()
        // Match human input with key from promptStore to get prompt text when there is none
        let promptText = humanInput || this.promptStore.get(humanInput) || null
        if (!promptText) {
            await vscode.window.showErrorMessage('Please enter a valid prompt for the recipe.')
            return null
        }

        const truncatedText = truncateText(promptText, MAX_HUMAN_INPUT_TOKENS)

        // Add com mand output to prompt text when available
        const commandOutput = context.editor.controllers?.prompt.get()
        if (commandOutput) {
            // promptT ext += `\n${commandOutput}\n`
            promptText += 'Please refer to the command output or the code I am looking at to answer my quesiton.'
        }

        // Add sel ection file name as display when available
        const displayText = selection?.fileName ? this.getHumanDisplayText(humanInput, selection?.fileName) : humanInput

        return Promise.resolve(
            new Interaction(
                { speaker: 'human', text: promptText, displayText },
                { speaker: 'assistant' },
                this.getContextMessages(
                    truncatedText,
                    context.editor,
                    context.codebaseContext,
                    selection,
                    commandOutput
                ),
                []
            )
        )
    }

    private async getContextMessages(
        text: string,
        editor: Editor,
        codebaseContext: CodebaseContext,
        selection?: ActiveTextEditorSelection | null,
        commandOutput?: string | null
    ): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []
        const contextConfig = editor.controllers?.prompt.get('context')
        const isCodebaseContextRequired = contextConfig
            ? (JSON.parse(contextConfig) as CodyPromptContext)
            : defaultCodyPromptContext
        // Codebas e context is not included by default
        if (isCodebaseContextRequired.codebase) {
            const codebaseContextMessages = await codebaseContext.getContextMessages(text, {
                numCodeResults: 12,
                numTextResults: 3,
            })
            contextMessages.push(...codebaseContextMessages)
        }
        // Create  context messages from open tabs
        if (isCodebaseContextRequired.openTabs) {
            contextMessages.push(...MyPrompt.getEditorOpenTabsContext())
        }
        // Create  context messages from current directory
        if (isCodebaseContextRequired.currentDir) {
            const currentDirContext = await MyPrompt.getCurrentDirContext()
            contextMessages.push(...currentDirContext)
        }
        // Add sel ected text as context when available
        if (selection?.selectedText && !isCodebaseContextRequired.excludeSelection) {
            contextMessages.push(...ChatQuestion.getEditorSelectionContext(selection))
        }
        // Create  context messages from terminal output if any
        if (commandOutput) {
            contextMessages.push(...MyPrompt.getTerminalOutputContext(commandOutput))
        }
        return contextMessages.slice(-12)
    }

    // Get con text from current editor open tabs
    public static getEditorOpenTabsContext(): ContextMessage[] {
        const contextMessages: ContextMessage[] = []
        // Skip th e current active tab (which is already included in selection context), files in currentDir, and non-file tabs
        const openTabs = vscode.window.visibleTextEditors
        for (const tab of openTabs) {
            if (tab === vscode.window.activeTextEditor || tab.document.uri.scheme !== 'file') {
                continue
            }
            const fileName = tab.document.fileName
            const truncatedContent = truncateText(tab.document.getText(), MAX_CURRENT_FILE_TOKENS)
            const contextMessage = getContextMessageWithResponse(
                populateCurrentEditorContextTemplate(truncatedContent, fileName),
                {
                    fileName,
                }
            )
            contextMessages.push(...contextMessage)
        }
        return contextMessages
    }

    public static getTerminalOutputContext(output: string): ContextMessage[] {
        const truncatedContent = truncateText(output, MAX_CURRENT_FILE_TOKENS)
        return [
            { speaker: 'human', text: populateTerminalOutputContextTemplate(truncatedContent) },
            { speaker: 'assistant', text: 'OK.' },
        ]
    }

    // Create Context from Current Directory of Active Document
    public static async getCurrentDirContext(): Promise<ContextMessage[]> {
        // get current document file path
        const currentDoc = vscode.window.activeTextEditor?.document
        if (!currentDoc) {
            return []
        }
        return InlineTouch.getEditorDirContext(currentDoc.fileName.replace(/\/[^/]+$/, ''))
    }

    // Get dis play text for human
    private getHumanDisplayText(humanChatInput: string, fileName: string): string {
        return humanChatInput + InlineTouch.displayPrompt + fileName
    }
}

export interface CodyPromptContext {
    codebase: boolean
    openTabs?: boolean
    currentDir?: boolean
    excludeSelection?: boolean
}

export const defaultCodyPromptContext: CodyPromptContext = {
    codebase: false,
    openTabs: false,
    currentDir: false,
    excludeSelection: false,
}
