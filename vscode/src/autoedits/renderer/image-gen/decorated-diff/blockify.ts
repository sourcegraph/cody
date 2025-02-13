import { getEditorTabSize } from '@sourcegraph/cody-shared'
import detectIndent from 'detect-indent'
import * as vscode from 'vscode'
import type { LineChange } from '../../decorators/base'
import type { LineHighlights, VisualDiff } from '../decorated-diff/types'
import { getCodeBlock } from '../decorated-diff/utils'

export const UNICODE_SPACE = '\u00A0'

export function blockify(
    diff: VisualDiff,
    mode: 'additions' | 'unified',
    document: vscode.TextDocument
): VisualDiff {
    const spaceAdjusted = convertToSpaceIndentation(document, diff)
    const leadingRemoved = removeLeadingWhitespaceBlock(spaceAdjusted)
    const paddingAdded = padTrailingWhitespaceBlock(leadingRemoved, mode)
    return paddingAdded
}

const transformToUnicodeSpace = (text: string): string =>
    text.replace(/^\s+/, match => UNICODE_SPACE.repeat(match.length))

const transformTabsToSpaces = (text: string, tabSize: number): string =>
    text.replace(/^(\t+)/, match => UNICODE_SPACE.repeat(match.length * tabSize))

const countLeadingTabs = (text: string): number => (text.match(/\t/g) || []).length

export function convertToSpaceIndentation(document: vscode.TextDocument, diff: VisualDiff): VisualDiff {
    const { code } = getCodeBlock(diff, 'incoming')
    const incomingIndentation = detectIndent(code).type
    if (incomingIndentation === 'space') {
        // In order to reliably render spaces in VS Code decorations, we must convert them to
        // their unicode equivalent
        const lines = diff.lines.map(line => {
            if (line.type === 'modified') {
                return {
                    ...line,
                    oldText: transformToUnicodeSpace(line.oldText),
                    newText: transformToUnicodeSpace(line.newText),
                }
            }
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
        if (line.type === 'modified') {
            return {
                ...line,
                oldSyntaxHighlights: shiftHighlights(
                    line.oldSyntaxHighlights,
                    countLeadingTabs(line.oldText) * (tabSize - 1)
                ),
                newSyntaxHighlights: shiftHighlights(
                    line.newSyntaxHighlights,
                    countLeadingTabs(line.newText) * (tabSize - 1)
                ),
                oldText: transformTabsToSpaces(line.oldText, tabSize),
                newText: transformTabsToSpaces(line.newText, tabSize),
            }
        }

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
        const text = 'newText' in line ? line.newText : line.text
        const leadingWhitespaceMatch = text.match(/^\s*/)
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
        if (line.type === 'modified') {
            return {
                ...line,
                changes: shiftChanges(line.changes, -leastCommonWhitespacePrefix.length),
                oldHighlights: shiftHighlights(
                    line.oldSyntaxHighlights,
                    -leastCommonWhitespacePrefix.length
                ),
                newHighlights: shiftHighlights(
                    line.newSyntaxHighlights,
                    -leastCommonWhitespacePrefix.length
                ),
                oldText: line.oldText.substring(leastCommonWhitespacePrefix.length),
                newText: line.newText.substring(leastCommonWhitespacePrefix.length),
            }
        }

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

// TODO: Do we need to handle unified better here? Are we not handling if the deleted line is the longest
function padTrailingWhitespaceBlock(diff: VisualDiff, mode: 'additions' | 'unified'): VisualDiff {
    let maxLineWidth = 0
    for (const line of diff.lines) {
        const text = 'newText' in line ? line.newText : line.text
        maxLineWidth = Math.max(maxLineWidth, text.length)
    }

    const lines = diff.lines.map(line => {
        if (line.type === 'modified') {
            return {
                ...line,
                newText: line.newText.padEnd(maxLineWidth, UNICODE_SPACE),
                oldText: line.oldText.padEnd(maxLineWidth, UNICODE_SPACE),
            }
        }

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
