import * as vscode from 'vscode'

import { type ContextItem, displayPath } from '@sourcegraph/cody-shared'
import { trailingNonAlphaNumericRegex } from './test-commands'

/**
 * VS Code intentionally limits what `command:vscode.open?ARGS` can have for args (see
 * https://github.com/microsoft/vscode/issues/178868#issuecomment-1494826381); you can't pass a
 * selection or viewColumn. We need to proxy `vscode.open` to be able to pass these args.
 *
 * Also update `lib/shared/src/chat/markdown.ts`'s `ALLOWED_URI_REGEXP` if you change this.
 */
export const CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID = '_cody.vscode.open'

/**
 * Creates display text for the given context files by replacing file names with markdown links.
 */
export function createDisplayTextWithFileLinks(humanInput: string, files: ContextItem[]): string {
    let formattedText = humanInput
    for (const file of files) {
        // +1 on the end line numbers because we want to make sure to include everything on the end line by
        // including the next line at position 0.
        formattedText = replaceFileNameWithMarkdownLink(
            formattedText,
            file.uri,
            file.range && new vscode.Range(file.range.start.line, 0, file.range.end.line + 1, 0),
            file.type === 'symbol' ? file.symbolName : undefined
        )
    }
    return formattedText
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
    const inputRepr = inputRepresentation(humanInput, file, range, symbolName)
    if (!inputRepr) {
        return humanInput
    }
    // Use regex to makes sure the file name is surrounded by spaces and not a substring of another file name
    const fileAsInput = inputRepr.replaceAll(/[$()*+./?[\\\]^{|}-]/g, '\\$&')
    const textToBeReplaced = new RegExp(`\\s*@${fileAsInput}(?![\S#-_])`, 'g')
    const markdownText = `[_@${inputRepr}_](command:${CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID}?${encodeURIComponent(
        JSON.stringify([
            file.toJSON(),
            {
                selection: range,
                preserveFocus: true,
                background: false,
                preview: true,
                viewColumn: vscode.ViewColumn.Beside,
            },
        ])
    )})`

    const text = humanInput
        .replace(trailingNonAlphaNumericRegex, '')
        .replace(textToBeReplaced, ` ${markdownText}`)
    const trailingNonAlphanum = humanInput.match(trailingNonAlphaNumericRegex)?.[0] ?? ''
    return (text + trailingNonAlphanum).trim()
}

/**
 * Generates a string representation of the given file, range, and symbol name
 * to use when linking to locations in code.
 */
function inputRepresentation(
    humanInput: string,
    file: vscode.Uri,
    range?: vscode.Range,
    symbolName?: string
): string {
    const fileName = displayPath(file)
    const components = [fileName]
    const startLine = range?.start?.line
    // +1 on start line because VS Code line numbers start at 1 in the editor UI,
    // and is zero-based in the API for position used in VS Code selection/range.
    // Since createDisplayTextWithFileLinks added 1 to end line, we don't need to add it again here.
    // But add it for start line because this is for displaying the line number to user, which is +1-based.
    if (startLine !== undefined) {
        const fullRange = range?.end?.line && `:${startLine + 1}-${range.end.line}`
        if (fullRange && humanInput.includes(`@${fileName}${fullRange}`)) {
            components.push(fullRange)
        } else if (humanInput.matchAll(new RegExp(`@${fileName}:${startLine}(?!-)`, 'g'))) {
            if (startLine + 1 === range?.end?.line) {
                components.push(`:${startLine + 1}`)
            }
        }
        components.push(symbolName ? `#${symbolName}` : '')
    }

    return components.join('').trim()
}
