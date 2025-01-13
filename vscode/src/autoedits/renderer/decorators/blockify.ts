import * as vscode from 'vscode'
import { getEditorTabSize } from '@sourcegraph/cody-shared'
import { AddedLinesDecorationInfo } from './default-decorator'
import detectIndent from 'detect-indent'

export const UNICODE_SPACE = '\u00A0'

export function blockify(document: vscode.TextDocument, addedLines: AddedLinesDecorationInfo[]): AddedLinesDecorationInfo[] {
    const spaceAdjusted = convertToSpaceIndentation(document, addedLines)
    const leadingRemoved = removeLeadingWhitespaceBlock(spaceAdjusted)
    const paddingAdded = padTrailingWhitespaceBlock(leadingRemoved)
    return paddingAdded
}

export function convertToSpaceIndentation(document: vscode.TextDocument, addedLines: AddedLinesDecorationInfo[]): AddedLinesDecorationInfo[] {
    const incomingIndentation = detectIndent(addedLines.map((line) => line.lineText).join('\n')).type
    if (incomingIndentation === 'space') {
        // Convert regular spaces to unicode spaces
        return addedLines.map(line => ({
            ...line,
            lineText: line.lineText.replace(/^( +)/, match => UNICODE_SPACE.repeat(match.length))
        }))
    }

    const tabSize = getEditorTabSize(document.uri, vscode.workspace, vscode.window)
    const tabAsSpace = UNICODE_SPACE.repeat(tabSize)
    return addedLines.map(line => ({
        ...line,
        lineText: line.lineText.replace(/^(\t+)/, match => tabAsSpace.repeat(match.length))
    }))
}


function padTrailingWhitespaceBlock(addedLines: AddedLinesDecorationInfo[]): AddedLinesDecorationInfo[] {
    let maxLineWidth = 0
    for (const addedLine of addedLines) {
        maxLineWidth = Math.max(maxLineWidth, addedLine.lineText.length)
    }
    return addedLines.map(line => ({
        ...line,
        lineText: line.lineText.padEnd(maxLineWidth, UNICODE_SPACE)
    }))
}
function removeLeadingWhitespaceBlock(addedLines: AddedLinesDecorationInfo[]): AddedLinesDecorationInfo[] {
    let leastCommonWhitespacePrefix: undefined | string = undefined
    for (const addedLine of addedLines) {
        const leadingWhitespaceMatch = addedLine.lineText.match(/^\s*/)
        if (leadingWhitespaceMatch === null) {
            leastCommonWhitespacePrefix = ''
            break
        }
        const leadingWhitespace = leadingWhitespaceMatch[0]
        if (leastCommonWhitespacePrefix === undefined) {
            leastCommonWhitespacePrefix = leadingWhitespace
            continue
        }
        // get common prefix of leastCommonWhitespacePrefix and leadingWhitespace
        leastCommonWhitespacePrefix = getCommonPrefix(leastCommonWhitespacePrefix, leadingWhitespace)
    }
    if (!leastCommonWhitespacePrefix) {
        return addedLines
    }
    return addedLines.map(line => ({
        ...line,
        lineText: line.lineText.replace(leastCommonWhitespacePrefix, ''),
        ranges: line.ranges.map(([start, end]) => [
            start - leastCommonWhitespacePrefix.length,
            end - leastCommonWhitespacePrefix.length
        ])
    }))
}
function getCommonPrefix(s1: string, s2: string): string {
    const minLength = Math.min(s1.length, s2.length)
    let commonPrefix = ''
    for (let i = 0; i < minLength; i++) {
        if (s1[i] === s2[i]) {
            commonPrefix += s1[i]
        } else {
            break
        }
    }
    return commonPrefix
}
