import * as vscode from 'vscode'
import { ThemeColor } from 'vscode'
import { GHOST_TEXT_COLOR } from '../../../commands/GhostHintDecorator'
import {
    type AutoeditsDecorator,
    type DecorationInformation,
    type DecorationLineInformation,
    DecorationLineType,
} from './base'
import { isOnlyAddingTextForModifiedLines, splitLineDecorationIntoLineTypes } from './common'

interface AddedLinesDecorationInfo {
    ranges: [number, number][]
    afterLine: number
    lineText: string
}

export class DefaultDecorator implements AutoeditsDecorator {
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
            backgroundColor: new ThemeColor('diffEditor.removedTextBackground'),
        })
        this.modifiedTextDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new ThemeColor('diffEditor.removedTextBackground'),
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
                backgroundColor: 'rgb(100, 255, 100, 0.1)',
                color: GHOST_TEXT_COLOR,
                height: '100%',
            },
        })
        this.insertMarkerDecorationType = vscode.window.createTextEditorDecorationType({
            border: '1px dashed rgb(100, 255, 100, 0.5)',
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
     * Renders decorations using an inline diff strategy to show changes between two versions of text
     * Split the decorations into three parts:
     * 1. Modified lines: Either show inline ghost text or a combination of ("red" decorations + "green" decorations)
     * 2. Removed lines: Show Inline decoration with "red" marker indicating deletions
     * 3. Added lines: Show Inline decoration with "green" marker indicating additions
     */
    public setDecorations(decorationInformation: DecorationInformation): void {
        const { modifiedLines, removedLines, addedLines } = splitLineDecorationIntoLineTypes(
            decorationInformation.lines
        )
        const isOnlyAdditionsForModifiedLines = isOnlyAddingTextForModifiedLines(modifiedLines)
        const removedLinesRanges = this.getNonModifiedLinesRanges(
            removedLines
                .filter(line => line.oldLineNumber !== null)
                .map(line => line.oldLineNumber as number)
        )
        this.editor.setDecorations(this.removedTextDecorationType, removedLinesRanges)

        if (addedLines.length > 0 || !isOnlyAdditionsForModifiedLines) {
            this.renderDiffDecorations(decorationInformation)
        } else {
            this.renderInlineGhostTextDecorations(modifiedLines)
        }
    }

    private renderDiffDecorations(decorationInformation: DecorationInformation): void {
        // Display the removed range decorations
        const removedRanges: vscode.Range[] = []
        const addedLinesInfo: AddedLinesDecorationInfo[] = []

        let firstModifiedLineMatch: {
            beforeLine: number
            afterLine: number
        } | null = null

        // Handle modified lines - collect removed ranges and added decorations
        for (const line of decorationInformation.lines) {
            if (
                line.lineType !== DecorationLineType.Modified ||
                line.oldLineNumber === null ||
                line.newLineNumber === null
            ) {
                continue
            }
            const addedRanges: [number, number][] = []
            for (const range of line.modifiedRanges) {
                if (range.to1 > range.from1) {
                    removedRanges.push(
                        new vscode.Range(line.oldLineNumber, range.from1, line.oldLineNumber, range.to1)
                    )
                }
                if (range.to2 > range.from2) {
                    addedRanges.push([range.from2, range.to2])
                }
            }
            if (addedRanges.length > 0) {
                firstModifiedLineMatch = {
                    beforeLine: line.oldLineNumber,
                    afterLine: line.newLineNumber,
                }
                addedLinesInfo.push({
                    ranges: addedRanges,
                    afterLine: line.newLineNumber,
                    lineText: line.newText,
                })
            }
        }
        this.editor.setDecorations(this.modifiedTextDecorationType, removedRanges)

        // Handle fully added lines
        for (const line of decorationInformation.lines) {
            if (line.lineType !== DecorationLineType.Added || line.newLineNumber === null) {
                continue
            }
            addedLinesInfo.push({
                ranges: line.modifiedRanges.map(range => [range.from2, range.to2]),
                afterLine: line.newLineNumber,
                lineText: line.newText,
            })
        }

        // Fill in any gaps in line numbers with empty ranges
        const lineNumbers = addedLinesInfo.map(d => d.afterLine)
        const min = Math.min(...lineNumbers)
        const max = Math.max(...lineNumbers)
        for (const line of decorationInformation.lines) {
            if (line.lineType !== DecorationLineType.Unchanged || line.newLineNumber === null) {
                continue
            }
            if (line.newLineNumber < min || line.newLineNumber > max) {
                continue
            }
            addedLinesInfo.push({
                ranges: [],
                afterLine: line.newLineNumber,
                lineText: line.newText,
            })
        }
        // Sort addedLinesInfo by line number in ascending order
        addedLinesInfo.sort((a, b) => a.afterLine - b.afterLine)
        if (addedLinesInfo.length === 0) {
            return
        }
        let startLine = this.editor.selection.active.line
        if (firstModifiedLineMatch) {
            startLine =
                firstModifiedLineMatch.beforeLine -
                (firstModifiedLineMatch.afterLine - addedLinesInfo[0].afterLine)
        }

        const replacerCol = Math.max(
            ...decorationInformation.oldLines
                .slice(startLine, startLine + addedLinesInfo.length)
                .map(line => line.length)
        )
        // todo (hitesh): handle case when too many lines to fit in the editor
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

    private renderInlineGhostTextDecorations(decorationInformation: DecorationLineInformation[]): void {
        const inlineModifiedRanges: vscode.DecorationOptions[] = []
        for (const line of decorationInformation) {
            if (line.lineType !== DecorationLineType.Modified || line.oldLineNumber === null) {
                continue
            }
            const modifiedRanges = line.modifiedRanges
            for (const range of modifiedRanges) {
                inlineModifiedRanges.push({
                    range: new vscode.Range(
                        line.oldLineNumber,
                        range.from1,
                        line.oldLineNumber,
                        range.to1
                    ),
                    renderOptions: {
                        before: {
                            contentText: line.newText.slice(range.from2, range.to2),
                        },
                    },
                })
            }
        }
        this.editor.setDecorations(this.suggesterType, inlineModifiedRanges)
    }

    private getNonModifiedLinesRanges(lineNumbers: number[]): vscode.Range[] {
        // Get the ranges of the lines that are not modified, i.e. fully removed or added lines
        return lineNumbers.map(
            line => new vscode.Range(line, 0, line, this.editor.document.lineAt(line).text.length)
        )
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
