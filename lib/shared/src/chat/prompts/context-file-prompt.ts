import * as vscode from 'vscode'

import { ContextFile, ContextMessage, createContextMessageByFile } from '../../codebase-context/messages'

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

/**
 * Creates display text for the given context files by replacing
 * file names with markdown links.
 */
export function createDisplayTexWithContextFiles(files: ContextFile[], text: string): string {
    let formattedText = text
    for (const file of files) {
        if (file?.displayName && file?.fileUri?.fsPath) {
            formattedText = getDisplayTextForFileUri(
                formattedText,
                file?.displayName.trim(),
                file?.fileUri?.fsPath,
                file.range?.start?.line
            )
        }
    }
    return formattedText
}

/**
 * Replaces a file display name in the given text with a markdown link
 * to open that file in the editor.
 * @returns The updated text with the file name replaced by a markdown link.
 */
export function getDisplayTextForFileUri(
    userInputText: string,
    fileDisplayName: string,
    fsPath: string,
    startLine = 0
): string {
    // Create markdown link to the file
    const range = startLine ? `:${startLine}` : ''
    const fileLink = `vscode://file${fsPath}${range}`
    const fileMarkdownText = `[_${fileDisplayName.trim()}_](${fileLink})`

    return userInputText.replace(fileDisplayName, fileMarkdownText)
}
