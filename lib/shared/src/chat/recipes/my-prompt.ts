import * as vscode from 'vscode'

import { CodebaseContext } from '../../codebase-context'
import { ContextMessage, getContextMessageWithResponse } from '../../codebase-context/messages'
import { MAX_CURRENT_FILE_TOKENS, MAX_HUMAN_INPUT_TOKENS } from '../../prompt/constants'
import { populateCurrentEditorContextTemplate } from '../../prompt/templates'
import { truncateText } from '../../prompt/truncation'
import { Interaction } from '../transcript/interaction'

import { ChatQuestion } from './chat-question'
import { InlineTouch } from './inline-touch'
import { Recipe, RecipeContext, RecipeID } from './recipe'

/** ======================================================
 * Recipe for Generating Prompts from Workspace Files
====================================================== **/
export class MyPrompt implements Recipe {
    public id: RecipeID = 'my-prompt'
    private promptStore = new Map<string, string>()

    public async getInteraction(humanChatInput: string, context: RecipeContext): Promise<Interaction | null> {
        const selection = context.editor.getActiveTextEditorSelection() || context.editor.controllers?.inline.selection
        // Make prompt text
        const humanInput = humanChatInput.trim()

        // GMatch human input with key from promptStore to get prompt
        let promptText = humanInput || this.promptStore.get(humanInput) || (await this.gePromptFromInput())
        if (!promptText) {
            return null
        }
        const truncatedText = truncateText(promptText, MAX_HUMAN_INPUT_TOKENS)
        const commandOutput = context.editor.controllers?.prompt.get()
        if (commandOutput) {
            promptText += `\n${commandOutput}`
        }
        let displayText = ''
        // Add selected text as context when available
        if (selection?.selectedText) {
            promptText += ChatQuestion.getEditorSelectionContext(selection)[0].text
            displayText = this.getHumanDisplayText(humanInput, selection.fileName)
        }

        return Promise.resolve(
            new Interaction(
                {
                    speaker: 'human',
                    text:
                        promptText +
                        'Please refer to the code and command output I am sharing with you as context to answer my quesitons.',
                    displayText,
                },
                { speaker: 'assistant' },
                this.getContextMessages(truncatedText, context.codebaseContext),
                []
            )
        )
    }

    private async getContextMessages(text: string, codebaseContext: CodebaseContext): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []
        const codebaseContextMessages = await codebaseContext.getContextMessages(text, {
            numCodeResults: 12,
            numTextResults: 3,
        })
        contextMessages.push(...codebaseContextMessages)
        // Create context messages from open tabs
        if (contextMessages.length < 12) {
            contextMessages.push(...MyPrompt.getEditorOpenTabsContext())
        }
        return contextMessages.slice(-16)
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

    // ======================================================== //
    //                          HELPERS                         //
    // ======================================================== //

    // Get display text for human
    private getHumanDisplayText(humanChatInput: string, fileName: string): string {
        return humanChatInput + InlineTouch.displayPrompt + fileName
    }

    private async gePromptFromInput(): Promise<void> {
        // Get the prompt name and prompt description from the user using the input box with 2 steps
        const promptName = await vscode.window.showInputBox({
            prompt: 'Enter a prompt name:',
            validateInput: (input: string) => {
                if (!input) {
                    return 'Please enter a prompt name.'
                }
                return
            },
        })
        const promptDescription = await vscode.window.showInputBox({
            prompt: 'Enter a prompt description:',
            validateInput: (input: string) => {
                if (!input) {
                    return 'Please enter a prompt description.'
                }
                return
            },
        })

        if (!promptName || !promptDescription) {
            return
        }
        this.promptStore.set(promptName, promptDescription)
    }
}
