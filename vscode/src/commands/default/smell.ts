import type { ContextFile } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getContextFileFromCursor } from '../context/get-cursor-context'

export async function executeSmellCommand(): Promise<void> {
    const prompt =
        "Please review and analyze the selected code and identify potential areas for improvement related to code smells, readability, maintainability, performance, security, etc. Do not list issues already addressed in the given code. Focus on providing up to 5 constructive suggestions that could make the code more robust, efficient, or align with best practices. For each suggestion, provide a brief explanation of the potential benefits. After listing any recommendations, summarize if you found notable opportunities to enhance the code quality overall or if the code generally follows sound design principles. If no issues found, reply 'There are no errors.'"

    const addEnhancedContext = false

    const contextFiles: ContextFile[] = []
    const contextFile = await getContextFileFromCursor()
    if (contextFile) {
        contextFiles.push(contextFile)
    }

    vscode.commands.executeCommand('cody.action.chat', prompt, {
        contextFiles,
        addEnhancedContext,
        source: 'smell',
    })
}
