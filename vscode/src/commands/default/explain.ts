import type { ContextFile } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getContextFileFromCursor } from '../context/get-cursor-context'

export async function executeExplainCommand(): Promise<void> {
    const prompt =
        'Explain what the selected code does in simple terms. Assume the audience is a beginner programmer who has just learned the language features and basic syntax. Focus on explaining: 1) The purpose of the code 2) What input(s) it takes 3) What output(s) it produces 4) How it achieves its purpose through the logic and algorithm. 5) Any important logic flows or data transformations happening. Use simple language a beginner could understand. Include enough detail to give a full picture of what the code aims to accomplish without getting too technical. Format the explanation in coherent paragraphs, using proper punctuation and grammar. Write the explanation assuming no prior context about the code is known. Do not make assumptions about variables or functions not shown in the shared code. Start the answer with the name of the code that is being explained.'

    const addEnhancedContext = false

    const contextFiles: ContextFile[] = []
    const contextFile = await getContextFileFromCursor()
    if (!contextFile) {
        void vscode.window.showErrorMessage('Please open a file before running a command.')
        return
    }
    contextFiles.push(contextFile)

    vscode.commands.executeCommand('cody.action.chat', prompt, {
        contextFiles,
        addEnhancedContext,
        source: 'explain',
    })
}
