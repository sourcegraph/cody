import { getEditorTabSize } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

/**
 * Returns the last full line in a string.
 * E.g. "Hello\nWorld\n" -> "World"
 */
const FULL_LINES_REGEX = /.*\n(?=.*$)/

export function getLastFullLine(str: string): string {
    const match = str.match(FULL_LINES_REGEX)

    if (match) {
        // Trim the new line character
        return match[0].slice(0, -1)
    }

    return ''
}

const UNICODE_SPACE = '\u00a0'

function getTextWithSpaceIndentation(text: string, document: vscode.TextDocument): string {
    const hasTabs = /\t/.test(text)
    if (!hasTabs) {
        // Pad the line with any leading whitespace
        const padding = (text.match(/^\s*/)?.[0] || '').length
        return UNICODE_SPACE.repeat(padding) + text.trim()
    }

    const tabSize = getEditorTabSize(document.uri, vscode.workspace, vscode.window)
    const tabAsSpace = UNICODE_SPACE.repeat(tabSize)
    return text.replaceAll(/\t/g, tabAsSpace)
}

export function getDecorationSuitableText(text: string, document: vscode.TextDocument): string {
    // Decorations do not render the tab character, so update it to use whitespace
    const textWithSpaceIndentation = getTextWithSpaceIndentation(text, document)
    // Decorations do not render normal spaces, we must use unicode spaces to ensure they are not trimmed.
    return textWithSpaceIndentation.replace(/ /g, UNICODE_SPACE)
}
