import * as vscode from 'vscode'

import { displayPath } from '@sourcegraph/cody-shared'
import { type ContextFile } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { type ActiveTextEditorSelection } from '@sourcegraph/cody-shared/src/editor'

import { trailingNonAlphaNumericRegex } from './utils'

/**
 * Creates display text for the given context files by replacing file names with markdown links.
 */
export function createDisplayTextWithFileLinks(humanInput: string, files: ContextFile[]): string {
    let formattedText = humanInput
    for (const file of files) {
        if (file.uri) {
            const range = file.range
                ? new vscode.Range(
                      file.range.start.line,
                      file.range.start.character,
                      file.range.end.line,
                      file.range.end.character
                  )
                : undefined
            formattedText = replaceFileNameWithMarkdownLink(
                formattedText,
                file.uri,
                range,
                file.type === 'symbol' ? file.symbolName : undefined
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
    if (!selection) {
        return humanInput
    }

    const range = selection.selectionRange
        ? new vscode.Range(
              selection.selectionRange.start.line,
              selection.selectionRange.start.character,
              selection.selectionRange.end.line,
              selection.selectionRange.end.character
          )
        : undefined

    const displayText = `${humanInput} @${inputRepresentation(selection.fileUri, range)}`

    // Create markdown link to the file

    return replaceFileNameWithMarkdownLink(displayText, selection.fileUri, range)
}

/**
 * Replaces a file name in given text with markdown link to open that file in editor.
 * @returns The updated text with the file name replaced by a markdown link.
 */
export function replaceFileNameWithMarkdownLink(
    humanInput: string,
    file: vscode.Uri,
    range?: vscode.Range,
    symbolName?: string
): string {
    const inputRepr = inputRepresentation(file, range, symbolName)

    // Create markdown link to the file
    const fileLink = `${file.toString()}:range:${range?.start.line ?? 0}`

    // Encode the filename to go on the command: link in a way that preserves all characters
    // including backslashes from Windows paths:
    // https://github.com/microsoft/vscode/issues/200965
    const encodedFileLink = encodeURIComponent(JSON.stringify(fileLink))
    // Then encode the complete link to go into Markdown.
    const markdownText = `[_@${inputRepr}_](command:cody.chat.open.file?${encodedFileLink})`

    // Use regex to makes sure the file name is surrounded by spaces and not a substring of another file name
    const textToBeReplaced = new RegExp(`\\s*@${inputRepr.replaceAll(/[$()*+./?[\\\]^{|}-]/g, '\\$&')}(?!\\S)`, 'g')
    const text = humanInput.replace(trailingNonAlphaNumericRegex, '').replaceAll(textToBeReplaced, ` ${markdownText}`)
    const lastChar = trailingNonAlphaNumericRegex.test(humanInput) ? humanInput.slice(-1) : ''
    return (text + lastChar).trim()
}

function inputRepresentation(file: vscode.Uri, range?: vscode.Range, symbolName?: string): string {
    return [
        displayPath(file),
        range && !(range.start.line === 0 && range.end.line === 0) ? `:${range.start.line}-${range.end.line}` : '',
        symbolName ? `#${symbolName}` : '',
    ]
        .join('')
        .trim()
}
