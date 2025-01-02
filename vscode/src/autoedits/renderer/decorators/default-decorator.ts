import * as vscode from 'vscode'

import { GHOST_TEXT_COLOR } from '../../../commands/GhostHintDecorator'

import type { AutoEditsDecorator, DecorationInfo, ModifiedLineInfo } from './base'

interface AddedLinesDecorationInfo {
    ranges: [number, number][]
    afterLine: number
    lineText: string
}

export class DefaultDecorator implements AutoEditsDecorator {
    private readonly decorationTypes: vscode.TextEditorDecorationType[]
    private readonly removedTextDecorationType: vscode.TextEditorDecorationType
    private readonly modifiedTextDecorationType: vscode.TextEditorDecorationType
    private readonly suggesterType: vscode.TextEditorDecorationType
    private readonly hideRemainderDecorationType: vscode.TextEditorDecorationType
    private readonly addedLinesDecorationType: vscode.TextEditorDecorationType
    private readonly insertMarkerDecorationType: vscode.TextEditorDecorationType
    private readonly editor: vscode.TextEditor

    constructor(editor: vscode.TextEditor) {
        this.editor = editor
        // Initialize decoration types
        this.removedTextDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
        })
        this.modifiedTextDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
        })
        this.suggesterType = vscode.window.createTextEditorDecorationType({
            before: { color: GHOST_TEXT_COLOR },
            after: { color: GHOST_TEXT_COLOR },
        })
        this.hideRemainderDecorationType = vscode.window.createTextEditorDecorationType({
            opacity: '0',
        })
        this.addedLinesDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'red', // SENTINEL (should not actually appear)
            before: {
                backgroundColor: 'rgba(100, 255, 100, 0.1)',
                color: GHOST_TEXT_COLOR,
                height: '100%',
            },
        })
        this.insertMarkerDecorationType = vscode.window.createTextEditorDecorationType({
            border: '1px dashed rgba(100, 255, 100, 0.5)',
            borderWidth: '1px 1px 0 0',
        })

        // Track all decoration types for disposal
        this.decorationTypes = [
            this.removedTextDecorationType,
            this.modifiedTextDecorationType,
            this.suggesterType,
            this.hideRemainderDecorationType,
            this.addedLinesDecorationType,
            this.insertMarkerDecorationType,
        ]
    }

    private clearDecorations(): void {
        for (const decorationType of this.decorationTypes) {
            this.editor.setDecorations(decorationType, [])
        }
    }

    /**
     * Renders decorations using an inline diff strategy to show changes between two versions of text.
     * It splits the decorations into three parts:
     * 1. Modified lines: Either show inline ghost text or a combination of ("red" decorations + "green" decorations)
     * 2. Removed lines: Show inline decoration with "red" marker indicating deletions
     * 3. Added lines: Show inline decoration with "green" marker indicating additions
     */
    public setDecorations(decorationInfo: DecorationInfo): void {
        const { modifiedLines, removedLines, addedLines } = decorationInfo

        const removedLinesRanges = removedLines.map(line =>
            this.createFullLineRange(line.originalLineNumber)
        )
        this.editor.setDecorations(this.removedTextDecorationType, removedLinesRanges)

        if (addedLines.length > 0 || !isOnlyAddingTextForModifiedLines(modifiedLines)) {
            this.renderDiffDecorations(decorationInfo)
        } else {
            this.renderInlineGhostTextDecorations(modifiedLines)
        }
    }

    private renderDiffDecorations(decorationInfo: DecorationInfo): void {
        const { modifiedLines, addedLines, unchangedLines } = decorationInfo

        // Display the removed range decorations
        const removedRanges: vscode.Range[] = []
        const addedLinesInfo: AddedLinesDecorationInfo[] = []

        // Handle modified lines - collect removed ranges and added decorations
        for (const modifiedLine of modifiedLines) {
            const changes = modifiedLine.changes

            const addedRanges: [number, number][] = []
            for (const change of changes) {
                if (change.type === 'delete') {
                    removedRanges.push(change.originalRange)
                } else if (change.type === 'insert') {
                    addedRanges.push([
                        change.modifiedRange.start.character,
                        change.modifiedRange.end.character,
                    ])
                }
            }
            if (addedRanges.length > 0) {
                addedLinesInfo.push({
                    ranges: addedRanges,
                    afterLine: modifiedLine.modifiedLineNumber,
                    lineText: modifiedLine.newText,
                })
            }
        }
        this.editor.setDecorations(this.modifiedTextDecorationType, removedRanges)

        // Handle fully added lines
        for (const addedLine of addedLines) {
            addedLinesInfo.push({
                ranges: [],
                afterLine: addedLine.modifiedLineNumber,
                lineText: addedLine.text,
            })
        }

        // Fill in any gaps in line numbers with empty ranges
        const lineNumbers = addedLinesInfo.map(d => d.afterLine)
        const min = Math.min(...lineNumbers)
        const max = Math.max(...lineNumbers)
        const addedLineNumbers = new Set(addedLinesInfo.map(d => d.afterLine))

        for (const line of [...unchangedLines, ...modifiedLines]) {
            const lineNumber = line.modifiedLineNumber
            if (lineNumber < min || lineNumber > max || addedLineNumbers.has(lineNumber)) {
                continue
            }
            addedLinesInfo.push({
                ranges: [],
                afterLine: lineNumber,
                lineText: line.type === 'modified' ? line.newText : line.text,
            })
            addedLineNumbers.add(lineNumber)
        }
        // Sort addedLinesInfo by line number in ascending order
        addedLinesInfo.sort((a, b) => a.afterLine - b.afterLine)
        if (addedLinesInfo.length === 0) {
            return
        }
        // todo (hitesh): handle case when too many lines to fit in the editor
        const oldLines = addedLinesInfo.map(info => this.editor.document.lineAt(info.afterLine))
        const replacerCol = Math.max(...oldLines.map(line => line.range.end.character))
        const startLine = Math.min(...oldLines.map(line => line.lineNumber))
        this.renderAddedLinesDecorations(addedLinesInfo, startLine, replacerCol)
    }

    private renderAddedLinesDecorations(
        addedLinesInfo: AddedLinesDecorationInfo[],
        startLine: number,
        replacerCol: number
    ): void {
        blockify(addedLinesInfo)
        const replacerDecorations: vscode.DecorationOptions[] = []
        for (let i = 0; i < addedLinesInfo.length; i++) {
            const j = i + startLine
            const line = this.editor.document.lineAt(j)
            const decoration = addedLinesInfo[i]

            if (replacerCol >= line.range.end.character) {
                replacerDecorations.push({
                    range: new vscode.Range(j, line.range.end.character, j, line.range.end.character),
                    renderOptions: {
                        // Show the suggested code but keep it positioned absolute to ensure
                        // the cursor does not jump there.
                        before: {
                            contentText:
                                '\u00A0'.repeat(3) +
                                _replaceLeadingTrailingChars(decoration.lineText, ' ', '\u00A0'),
                            margin: `0 0 0 ${replacerCol - line.range.end.character}ch`,
                            textDecoration: 'none; position: absolute;',
                        },
                        // Create an empty HTML element with the width required to show the suggested code.
                        // Required to make the viewport scrollable to view the suggestion if it's outside.
                        after: {
                            contentText:
                                '\u00A0'.repeat(3) +
                                _replaceLeadingTrailingChars(
                                    decoration.lineText.replace(/\S/g, '\u00A0'),
                                    ' ',
                                    '\u00A0'
                                ),
                            margin: `0 0 0 ${replacerCol - line.range.end.character}ch`,
                        },
                    },
                })
            } else {
                replacerDecorations.push({
                    range: new vscode.Range(j, replacerCol, j, replacerCol),
                    renderOptions: {
                        before: {
                            contentText:
                                '\u00A0' +
                                _replaceLeadingTrailingChars(decoration.lineText, ' ', '\u00A0'),
                            textDecoration: 'none; position: absolute;',
                        },
                        after: {
                            contentText:
                                '\u00A0'.repeat(3) +
                                _replaceLeadingTrailingChars(
                                    decoration.lineText.replace(/\S/g, '\u00A0'),
                                    ' ',
                                    '\u00A0'
                                ),
                        },
                    },
                })
            }
        }

        const startLineLength = this.editor.document.lineAt(startLine).range.end.character
        this.editor.setDecorations(this.insertMarkerDecorationType, [
            {
                range: new vscode.Range(startLine, 0, startLine, startLineLength),
            },
        ])
        this.editor.setDecorations(this.addedLinesDecorationType, replacerDecorations)
    }

    private renderInlineGhostTextDecorations(decorationLines: ModifiedLineInfo[]): void {
        const inlineModifiedRanges: vscode.DecorationOptions[] = decorationLines
            .flatMap(line => line.changes)
            .filter(change => change.type === 'insert')
            .map(change => {
                return {
                    range: change.originalRange,
                    renderOptions: {
                        before: {
                            contentText: change.text,
                        },
                    },
                }
            })

        this.editor.setDecorations(this.suggesterType, inlineModifiedRanges)
    }

    private createFullLineRange(lineNumber: number): vscode.Range {
        const lineTextLength = this.editor.document.lineAt(lineNumber).text.length
        return new vscode.Range(lineNumber, 0, lineNumber, lineTextLength)
    }

    public dispose(): void {
        this.clearDecorations()
        for (const decorationType of this.decorationTypes) {
            decorationType.dispose()
        }
    }
}

/**
 * Replaces leading and trailing occurrences of a character with another string
 * @param str The input string to process
 * @param oldS The character to replace
 * @param newS The character/string to replace with
 * @returns The string with leading and trailing characters replaced
 */
export function _replaceLeadingTrailingChars(str: string, oldS: string, newS: string): string {
    let prefixLen = str.length
    for (let i = 0; i < str.length; i++) {
        if (str[i] !== oldS) {
            // str = newS.repeat(i) + str.substring(i)
            prefixLen = i
            break
        }
    }
    str = newS.repeat(prefixLen) + str.substring(prefixLen)

    let suffixLen = str.length
    for (let i = 0; i < str.length; i++) {
        const j = str.length - 1 - i
        if (str[j] !== oldS) {
            // str = str.substring(0, j + 1) + newS.repeat(i)
            suffixLen = i
            break
        }
    }
    str = str.substring(0, str.length - suffixLen) + newS.repeat(suffixLen)

    return str
}

function blockify(addedLines: AddedLinesDecorationInfo[]) {
    removeLeadingWhitespaceBlock(addedLines)
    padTrailingWhitespaceBlock(addedLines)
}

function padTrailingWhitespaceBlock(addedLines: AddedLinesDecorationInfo[]) {
    let maxLineWidth = 0
    for (const addedLine of addedLines) {
        maxLineWidth = Math.max(maxLineWidth, addedLine.lineText.length)
    }
    for (const addedLine of addedLines) {
        addedLine.lineText = addedLine.lineText.padEnd(maxLineWidth, ' ')
    }
}

function removeLeadingWhitespaceBlock(addedLines: AddedLinesDecorationInfo[]) {
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
        return
    }
    for (const addedLine of addedLines) {
        addedLine.lineText = addedLine.lineText.replace(leastCommonWhitespacePrefix, '')
    }
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

/**
 * Checks if the only changes for modified lines are additions of text.
 */
export function isOnlyAddingTextForModifiedLines(modifiedLines: ModifiedLineInfo[]): boolean {
    for (const modifiedLine of modifiedLines) {
        if (modifiedLine.changes.some(change => change.type === 'delete')) {
            return false
        }
    }
    return true
}
