import { URI } from 'vscode-uri'

import { ContextFile } from '../../codebase-context/messages'
import { ActiveTextEditorSelection } from '../../editor'

import { isInWorkspace } from './vscode-context'

/**
 * Creates display text for the given context files by replacing file names with markdown links.
 */
export function createDisplayTextWithFileLinks(files: ContextFile[], text: string): string {
    let formattedText = text
    for (const file of files) {
        if (file?.fileName && file?.uri?.fsPath) {
            formattedText = replaceFileNameWithMarkdownLink(
                formattedText,
                file?.fileName.trim(),
                file?.uri?.fsPath,
                file.range?.start?.line
            )
        }
    }
    return formattedText
}

/**
 * Gets the display text to show for the human's input.
 *
 * If there is a selection, display the file name + range alongside with human input
 * If the workspace root is available, it generates a markdown link to the file.
 */
export function createDisplayTextWithFileSelection(
    humanInput: string,
    selection: ActiveTextEditorSelection | null,
    workspaceRoot: URI | null
): string {
    const fileName = selection?.fileName?.trim()
    if (!fileName) {
        return humanInput
    }

    const displayText = `${humanInput} @${fileName}`
    if (!workspaceRoot) {
        return displayText
    }

    // check if fileName is a workspace file or not
    const isFileWorkspaceFile = isInWorkspace(URI.file(fileName)) !== undefined
    const fileUri = isFileWorkspaceFile ? URI.parse(workspaceRoot.fsPath + fileName) : URI.file(fileName)

    // Create markdown link to the file
    return replaceFileNameWithMarkdownLink(
        displayText,
        `@${fileName}`,
        fileUri.fsPath,
        selection?.selectionRange?.start?.line
    )
}

/**
 * Replaces a file name in given text with markdown link to open that file in editor.
 * @returns The updated text with the file name replaced by a markdown link.
 */
export function replaceFileNameWithMarkdownLink(
    humanInput: string,
    fileName: string,
    fsPath: string,
    startLine = 0
): string {
    // Create markdown link to the file
    const range = startLine ? `:${startLine}` : ''
    const fileLink = `vscode://file${fsPath}${range}`
    const markdownText = `[_${fileName.trim()}_](${fileLink})`

    // Use regex to makes sure the file name is surrounded by spaces and not a substring of another file name
    const textToBeReplaced = new RegExp(`\\s*${fileName}(?!\\S)`, 'g')
    return humanInput.replaceAll(textToBeReplaced, ` ${markdownText}`).trim()
}
