import { ContextFile } from '../../codebase-context/messages'

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

    return userInputText.replaceAll(fileDisplayName, fileMarkdownText)
}

/**
 * Creates display text for the given context files by replacing
 * file names with markdown links.
 */
export function createDisplayTexWithContextFiles(files: ContextFile[], text: string): string {
    let formattedText = text
    for (const file of files) {
        if (file?.fileName && file?.fileUri?.fsPath) {
            formattedText = getDisplayTextForFileUri(
                formattedText,
                file?.fileName.trim(),
                file?.fileUri?.fsPath,
                file.range?.start?.line
            )
        }
    }
    return formattedText
}
