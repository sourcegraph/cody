import { ContextFile } from '../../codebase-context/messages'
import { ActiveTextEditorSelection } from '../../editor'

import { trailingNonAlphaNumericRegex } from './utils'

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
    selection?: ActiveTextEditorSelection | null
): string {
    const fileName = selection?.fileName?.trim()
    if (!fileName) {
        return humanInput
    }

    const displayText = `${humanInput} @${fileName}`
    const fsPath = selection?.fileUri?.fsPath
    const startLine = selection?.selectionRange?.start?.line
    const endLine = selection?.selectionRange?.end?.line
    if (!fsPath || !endLine) {
        return displayText
    }

    // Create markdown link to the file
    return replaceFileNameWithMarkdownLink(displayText, `@${fileName}`, fsPath, startLine)
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
    const fileLink = `${fsPath}:range:${startLine}`

    // Encode the filename to go on the command: link in a way that preserves all characters
    // including backslashes from Windows paths:
    // https://github.com/microsoft/vscode/issues/200965
    const encodedFileLink = encodeURIComponent(JSON.stringify(fileLink))
    // Then encode the complete link to go into Markdown.
    const markdownText = `[_${fileName.trim()}_](command:cody.chat.open.file?${encodedFileLink})`

    // Use regex to makes sure the file name is surrounded by spaces and not a substring of another file name
    const textToBeReplaced = new RegExp(`\\s*${fileName.replaceAll(/[$()*+./?[\\\]^{|}-]/g, '\\$&')}(?!\\S)`, 'g')
    const text = humanInput.replace(trailingNonAlphaNumericRegex, '').replaceAll(textToBeReplaced, ` ${markdownText}`)
    const lastChar = trailingNonAlphaNumericRegex.test(humanInput) ? humanInput.slice(-1) : ''
    return (text + lastChar).trim()
}
