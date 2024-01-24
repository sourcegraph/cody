import type { ContextFile } from '@sourcegraph/cody-shared'
import { getContextFileFromCursor } from '../context/get-selection-context'
import type { ExecuteChatArguments } from '.'
import * as vscode from 'vscode'
import { getContextFileFromFile } from '../context/get-file-context'

/**
 * explainCommand generates the prompt and arguments for the 'explain' command.
 *
 * Context: Current selection and current file
 */
export async function explainCommand(): Promise<{ prompt: string; args: ExecuteChatArguments }> {
    const addEnhancedContext = false
    const prompt =
        'Explain what the selected code does in simple terms. Assume the audience is a beginner programmer who has just learned the language features and basic syntax. Focus on explaining: 1) The purpose of the code 2) What input(s) it takes 3) What output(s) it produces 4) How it achieves its purpose through the logic and algorithm. 5) Any important logic flows or data transformations happening. Use simple language a beginner could understand. Include enough detail to give a full picture of what the code aims to accomplish without getting too technical. Format the explanation in coherent paragraphs, using proper punctuation and grammar. Write the explanation assuming no prior context about the code is known. Do not make assumptions about variables or functions not shown in the shared code. Start the answer with the name of the code that is being explained.'

    // fetches the context file from the current cursor position using getContextFileFromCursor().
    const contextFiles: ContextFile[] = []

    const cursorContext = await getContextFileFromCursor()
    if (cursorContext) {
        contextFiles.push(cursorContext)
    }

    const currentContext = await getContextFileFromFile()
    if (currentContext) {
        contextFiles.push(currentContext)
    }

    return {
        prompt,
        args: {
            userContextFiles: contextFiles,
            addEnhancedContext,
            source: 'explain',
        },
    }
}

/**
 * Executes the explain command as a chat command via 'cody.action.chat'
 */
export async function executeExplainCommand(): Promise<void> {
    const { prompt, args } = await explainCommand()
    vscode.commands.executeCommand('cody.action.chat', prompt, args)
}
