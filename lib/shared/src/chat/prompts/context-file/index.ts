import * as vscode from 'vscode'

import { ContextFile, ContextMessage, createContextMessageByFile } from '../../../codebase-context/messages'

/**
 * Creates context messages for each provided context file.
 * Iterates through the files, gets the content for each, and converts to ContextMessage.
 * Returns array of ContextMessages for all files.
 */
export async function createContextMessagesByContextFile(files: ContextFile[]): Promise<ContextMessage[]> {
    const contextFileMessages = []
    for (const file of files) {
        const content = await getContentByContextFile(file)
        if (content) {
            const message = createContextMessageByFile(file, content)
            contextFileMessages.push(...message)
        }
    }
    return contextFileMessages
}

/**
 * Gets the content from a context file.
 */
export async function getContentByContextFile(file: ContextFile): Promise<string | undefined> {
    if (!file.fileUri) {
        return undefined
    }

    let range: vscode.Range | undefined
    if (file.range) {
        const startLine = file?.range?.start?.line
        let endLine = file?.range.end?.line
        if (startLine === endLine) {
            endLine++
        }
        range = new vscode.Range(startLine, 0, endLine, 0)
    }

    // Get the text from document by file Uri
    const vscodeUri = vscode.Uri.parse(file.fileUri.fsPath)
    const doc = await vscode.workspace.openTextDocument(vscodeUri)
    return doc.getText(range)
}
