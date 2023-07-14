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
            await vscode.window.showErrorMessage('Please enter a valid for the recipe.')
            return null
        }

        const truncatedText = truncateText(promptText, MAX_HUMAN_INPUT_TOKENS)

        // Add command output to prompt text when available
        const commandOutput = context.editor.controllers?.prompt.get()
        if (commandOutput) {
            // promptText += `\n${commandOutput}\n`
            promptText += 'Please refer to the command output when answering my quesiton.'
        }

        // Add selection file name as display when available
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

        const isCodebaseContextRequired = editor.controllers?.prompt.get('context')
        if (isCodebaseContextRequired) {
            await vscode.window.showInformationMessage('Codebase is not required.')
            const codebaseContextMessages = await codebaseContext.getContextMessages(text, {
                numCodeResults: 12,
                numTextResults: 3,
            })
            contextMessages.push(...codebaseContextMessages)

            // Create context messages from open tabs
            if (contextMessages.length < 10) {
                contextMessages.push(...MyPrompt.getEditorOpenTabsContext())
            }
        }

        // Add selected text as context when available
        if (selection?.selectedText) {
            contextMessages.push(...ChatQuestion.getEditorSelectionContext(selection))
        }

        // Create context messages from terminal output if any
        if (commandOutput) {
            contextMessages.push(...MyPrompt.getTerminalOutputContext(commandOutput))
        }

        return contextMessages.slice(-12)
    }

    // Get context from current editor open tabs
    public static getEditorOpenTabsContext(): ContextMessage[] {
        const contextMessages: ContextMessage[] = []
        // Skip the current active tab (which is already included in selection context), files in currentDir, and non-file tabs
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

    // Get display text for human
    private getHumanDisplayText(humanChatInput: string, fileName: string): string {
        return humanChatInput + InlineTouch.displayPrompt + fileName
    }

    public static getTerminalOutputContext(output: string): ContextMessage[] {
        const truncatedContent = truncateText(output, MAX_CURRENT_FILE_TOKENS)
        return [
            { speaker: 'human', text: populateTerminalOutputContextTemplate(truncatedContent) },
            { speaker: 'assistant', text: 'OK.' },
        ]
    }
}
