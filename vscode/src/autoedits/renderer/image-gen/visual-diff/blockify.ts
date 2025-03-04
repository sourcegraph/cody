import { getEditorTabSize } from '@sourcegraph/cody-shared'
import detectIndent from 'detect-indent'
import * as vscode from 'vscode'
import type { LineChange } from '../../decorators/base'
import type { LineHighlights, VisualDiff } from './types'
import { getCodeBlock } from './utils'

export const UNICODE_SPACE = '\u00A0'

export function blockify(diff: VisualDiff, document: vscode.TextDocument): VisualDiff {
    const spaceAdjusted = convertToSpaceIndentation(document, diff)
    const leadingRemoved = removeLeadingWhitespaceBlock(spaceAdjusted)
    const paddingAdded = padTrailingWhitespaceBlock(leadingRemoved)
    return paddingAdded
}

const transformToUnicodeSpace = (text: string): string =>
    text.replace(/^\s+/, match => UNICODE_SPACE.repeat(match.length))

const transformTabsToSpaces = (text: string, tabSize: number): string =>
    text.replace(/^(\t+)/, match => UNICODE_SPACE.repeat(match.length * tabSize))

const countLeadingTabs = (text: string): number => (text.match(/\t/g) || []).length

export function convertToSpaceIndentation(document: vscode.TextDocument, diff: VisualDiff): VisualDiff {
    const codeBlock = getCodeBlock(diff, 'incoming')
    if (!codeBlock) {
        return diff
    }
    const incomingIndentation = detectIndent(codeBlock.code).type
    if (incomingIndentation === 'space') {
        // In order to reliably render spaces in VS Code decorations, we must convert them to
        // their unicode equivalent
        const lines = diff.lines.map(line => {
            return {
                ...line,
                text: transformToUnicodeSpace(line.text),
            }
        })

        return { ...diff, lines }
    }

    // The incoming indentation is tab-based, but this will not render correctly in VS Code decorations.
    // We must convert it to space indentation that matches the editor's tab size
    const tabSize = getEditorTabSize(document.uri, vscode.workspace, vscode.window)
    const lines = diff.lines.map(line => {
        const leadingTabs = countLeadingTabs(line.text)
        return {
            ...line,
            changes: 'changes' in line ? shiftChanges(line.changes, leadingTabs * (tabSize - 1)) : [],
            highlights: shiftHighlights(line.syntaxHighlights, leadingTabs * (tabSize - 1)),
            text: transformTabsToSpaces(line.text, tabSize),
        }
    })

    return { ...diff, lines }
}

function removeLeadingWhitespaceBlock(diff: VisualDiff): VisualDiff {
    let leastCommonWhitespacePrefix: undefined | string = undefined
    for (const line of diff.lines) {
        if (line.type === 'modified-removed' || line.type === 'removed') {
            continue
        }
        const leadingWhitespaceMatch = line.text.match(/^\s*/)
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
        return diff
    }

    const lines = diff.lines.map(line => {
        return {
            ...line,
            changes:
                'changes' in line ? shiftChanges(line.changes, -leastCommonWhitespacePrefix.length) : [],
            highlights: shiftHighlights(line.syntaxHighlights, -leastCommonWhitespacePrefix.length),
            text: line.text.substring(leastCommonWhitespacePrefix.length),
        }
    })

    return { ...diff, lines }
}

function padTrailingWhitespaceBlock(diff: VisualDiff): VisualDiff {
    let maxLineWidth = 0
    for (const line of diff.lines) {
        maxLineWidth = Math.max(maxLineWidth, line.text.length)
    }

    const lines = diff.lines.map(line => {
        return {
            ...line,
            text: line.text.padEnd(maxLineWidth, UNICODE_SPACE),
        }
    })

    return { ...diff, lines }
}

function shiftHighlights(
    highlights: LineHighlights['syntaxHighlights'],
    offset: number
): LineHighlights['syntaxHighlights'] {
    return {
        light: highlights.light.map(({ range: [start, end], ...rest }) => {
            return {
                ...rest,
                range: [start + offset, end + offset] as [number, number],
            }
        }),
        dark: highlights.dark.map(({ range: [start, end], ...rest }) => {
            return {
                ...rest,
                range: [start + offset, end + offset] as [number, number],
            }
        }),
    }
}

function shiftChanges(changes: LineChange[], offset: number): LineChange[] {
    return changes.map(change => {
        return {
            ...change,
            originalRange: new vscode.Range(
                change.originalRange.start.line,
                Math.max(0, change.originalRange.start.character + offset),
                change.originalRange.end.line,
                Math.max(0, change.originalRange.end.character + offset)
            ),
            modifiedRange: new vscode.Range(
                change.modifiedRange.start.line,
                Math.max(0, change.modifiedRange.start.character + offset),
                change.modifiedRange.end.line,
                Math.max(0, change.modifiedRange.end.character + offset)
            ),
        }
    })
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
