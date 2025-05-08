import type * as vscode from 'vscode'

import type { CodeToReplaceData } from '@sourcegraph/cody-shared'
import { getNewLineChar, lines } from '../completions/text-processing'

export function fixFirstLineIndentation(source: string, target: string): string {
    // Check the first line indentation of source string and replaces in target string.
    const codeToRewriteLines = lines(source)
    const completionLines = lines(target)
    const firstLineMatch = codeToRewriteLines[0].match(/^(\s*)/)
    const firstLineIndentation = firstLineMatch ? firstLineMatch[1] : ''
    completionLines[0] = firstLineIndentation + completionLines[0].trimStart()
    const completion = completionLines.join(getNewLineChar(source))
    return completion
}

/**
 * Split a string into lines, keeping the line endings.
 * @param s - The string to split.
 * @returns An array of lines.
 */
export function splitLinesKeepEnds(s: string): string[] {
    const pattern = /[^\r\n]*(?:\r\n|\n|\r|$)/g
    const lines = s.match(pattern) || []
    if (lines.length > 1 && lines[lines.length - 1] === '') {
        lines.pop()
    }
    return lines
}

export function isDuplicatingTextFromRewriteArea({
    addedText,
    codeToReplaceData,
}: { addedText: string; codeToReplaceData: CodeToReplaceData }): boolean {
    if (addedText.length === 0) {
        return false
    }

    const prefix = codeToReplaceData.prefixBeforeArea + codeToReplaceData.prefixInArea
    if (prefix.length > 0 && prefix.endsWith(addedText)) {
        return true
    }

    const suffix = codeToReplaceData.suffixInArea + codeToReplaceData.suffixAfterArea
    if (suffix.length > 0 && suffix.startsWith(addedText)) {
        return true
    }

    return false
}

/**
 * Counts the number of newline characters at the end of a string
 */
export function countNewLineCharsEnd(text: string): number {
    const match = text.match(/(?:\r\n|\n)+$/)
    return match ? match[0].length : 0
}

/**
 * Counts the number of newline characters at the start of a string
 */
export function countNewLineCharsStart(text: string): number {
    const match = text.match(/^(?:\r\n|\n)+/)
    return match ? match[0].length : 0
}

/**
 * Checks if a string consists only of newline characters
 */
export function isAllNewLineChars(text: string): boolean {
    return /^[\r\n]*$/.test(text)
}

/**
 * Removes all newline characters from both the start and end of a string
 */
export function trimNewLineCharsFromString(text: string): string {
    return text.replace(/^(?:\r\n|\n)+|(?:\r\n|\n)+$/g, '')
}

/**
 * Clips a number to a range, ensuring it is within the specified bounds.
 */
export function clip(line: number, min: number, max: number) {
    return Math.max(Math.min(line, max), min)
}

export function areSameUriDocs(a?: vscode.TextDocument, b?: vscode.TextDocument): boolean {
    return Boolean(a && b && a.uri.toString() === b.uri.toString())
}
