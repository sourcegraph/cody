import type { ContextFile } from '@sourcegraph/cody-shared'
import { getContextFileFromCursor } from '../context/selection'
import { getContextFileFromCurrentFile } from '../context/current-file'
import type { ChatSession } from '../../chat/chat-view/SimpleChatPanelProvider'
import { executeChat } from './ask'
import type { ExecuteChatArguments } from '.'

/**
 * Generates the prompt and context files with arguments for the 'explain' command.
 *
 * Context: Current selection and current file
 */
export async function explainCommand(): Promise<{ prompt: string; args: ExecuteChatArguments }> {
    const addEnhancedContext = false
    const prompt =
        'Explain what the selected code does in simple terms. Assume the audience is a beginner programmer who has just learned the language features and basic syntax. Focus on explaining: 1) The purpose of the code 2) What input(s) it takes 3) What output(s) it produces 4) How it achieves its purpose through the logic and algorithm. 5) Any important logic flows or data transformations happening. Use simple language a beginner could understand. Include enough detail to give a full picture of what the code aims to accomplish without getting too technical. Format the explanation in coherent paragraphs, using proper punctuation and grammar. Write the explanation assuming no prior context about the code is known. Do not make assumptions about variables or functions not shown in the shared code. Start the answer with the name of the code that is being explained.'

    // fetches the context file from the current cursor position using getContextFileFromCursor().
    const contextFiles: ContextFile[] = []

    const currentSelection = await getContextFileFromCursor()
    if (currentSelection) {
        contextFiles.push(currentSelection)
    }

    const currentFile = await getContextFileFromCurrentFile()
    if (currentFile) {
        contextFiles.push(currentFile)
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
export async function executeExplainCommand(): Promise<ChatSession | undefined> {
    const { prompt, args } = await explainCommand()

    return executeChat(prompt, args)
}
