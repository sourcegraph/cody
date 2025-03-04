import * as vscode from 'vscode'

import { GHOST_TEXT_COLOR } from '../../../commands/GhostHintDecorator'

import { isOnlyAddingTextForModifiedLines } from '../diff-utils'
import { generateSuggestionAsImage } from '../image-gen'
import { getEndColumnForLine } from '../image-gen/utils'
import { makeVisualDiff } from '../image-gen/visual-diff'
import type { AutoEditsDecorator, DecorationInfo, ModifiedLineInfo } from './base'
import { cssPropertiesToString } from './utils'

export interface DiffedTextDecorationRange {
    range: [number, number]
    type: 'diff-added'
}

export interface SyntaxHighlightedTextDecorationRange {
    range: [number, number]
    // Hex color that the text should be painted as
    color: string
    type: 'syntax-highlighted'
}

export interface AddedLinesDecorationInfo {
    highlightedRanges: (DiffedTextDecorationRange | SyntaxHighlightedTextDecorationRange)[]
    afterLine: number
    lineText: string
}

interface DiffDecorationAddedLinesInfo {
    /** Information about lines that have been added */
    addedLinesDecorationInfo: AddedLinesDecorationInfo[]
}

/**
 * Information about diff decorations to be applied to lines in the editor
 */
interface DiffDecorationInfo {
    /** Ranges of text that have been removed */
    removedRangesInfo: vscode.Range[]
    /** Information about lines that have been added */
    addedLinesInfo?: DiffDecorationAddedLinesInfo
}

export class DefaultDecorator implements AutoEditsDecorator {
    private readonly decorationTypes: vscode.TextEditorDecorationType[]
    private readonly editor: vscode.TextEditor

    // Decoration types
    private readonly removedTextDecorationType: vscode.TextEditorDecorationType
    private readonly modifiedTextDecorationType: vscode.TextEditorDecorationType
    private readonly suggesterType: vscode.TextEditorDecorationType
    private readonly addedLinesDecorationType: vscode.TextEditorDecorationType
    private readonly insertMarkerDecorationType: vscode.TextEditorDecorationType

    /**
     * Pre-computed information about diff decorations to be applied to lines in the editor.
     */
    private diffDecorationInfo: DiffDecorationInfo | undefined

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
        if (!this.diffDecorationInfo) {
            this.diffDecorationInfo = this.getDiffDecorationsInfo(decorationInfo)
        }
        this.editor.setDecorations(
            this.modifiedTextDecorationType,
            this.diffDecorationInfo.removedRangesInfo
        )
        const addedLinesInfo = this.diffDecorationInfo.addedLinesInfo

        if (!addedLinesInfo) {
            return
        }
        this.renderAddedLinesImageDecorations(decorationInfo)
    }

    private getDiffDecorationsInfo(decorationInfo: DecorationInfo): DiffDecorationInfo {
        const { modifiedLines, addedLines, unchangedLines } = decorationInfo

        // Display the removed range decorations
        const removedRanges: vscode.Range[] = []
        const addedLinesInfo: AddedLinesDecorationInfo[] = []

        // Handle modified lines - collect removed ranges and added decorations
        for (const modifiedLine of modifiedLines) {
            const changes = modifiedLine.changes

            const addedRanges: DiffedTextDecorationRange[] = []
            for (const change of changes) {
                if (change.type === 'delete') {
                    removedRanges.push(change.originalRange)
                } else if (change.type === 'insert') {
                    addedRanges.push({
                        type: 'diff-added',
                        range: [
                            change.modifiedRange.start.character,
                            change.modifiedRange.end.character,
                        ],
                    })
                }
            }
            if (addedRanges.length > 0) {
                addedLinesInfo.push({
                    highlightedRanges: addedRanges,
                    afterLine: modifiedLine.modifiedLineNumber,
                    lineText: modifiedLine.newText,
                })
            }
        }

        // Handle fully added lines
        for (const addedLine of addedLines) {
            addedLinesInfo.push({
                highlightedRanges: [{ type: 'diff-added', range: [0, addedLine.text.length] }],
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
                highlightedRanges: [],
                afterLine: lineNumber,
                lineText: line.type === 'modified' ? line.newText : line.text,
            })
            addedLineNumbers.add(lineNumber)
        }
        // Sort addedLinesInfo by line number in ascending order
        addedLinesInfo.sort((a, b) => a.afterLine - b.afterLine)
        if (addedLinesInfo.length === 0) {
            return { removedRangesInfo: removedRanges }
        }

        return {
            removedRangesInfo: removedRanges,
            addedLinesInfo: {
                addedLinesDecorationInfo: addedLinesInfo,
            },
        }
    }

    private renderAddedLinesImageDecorations(decorationInfo: DecorationInfo): void {
        // TODO: Diff mode will likely change depending on the environment.
        // This should be determined by client capabilities.
        // VS Code: 'additions'
        // Client capabiliies === image: 'unified'
        const diffMode = 'additions'
        const { diff, position } = makeVisualDiff(decorationInfo, diffMode, this.editor.document)
        const { dark, light, pixelRatio } = generateSuggestionAsImage({
            diff,
            lang: this.editor.document.languageId,
            mode: diffMode,
        })
        const startLineEndColumn = getEndColumnForLine(
            this.editor.document.lineAt(position.line),
            this.editor.document
        )

        // The padding in which to offset the decoration image away from neighbouring code
        const decorationPadding = 4
        // The margin position where the decoration image should render.
        // Ensuring it does not conflict with the visibility of existing code.
        const decorationMargin = position.column - startLineEndColumn + decorationPadding
        const decorationStyle = cssPropertiesToString({
            // Absolutely position the suggested code so that the cursor does not jump there
            position: 'absolute',
            // Make sure the decoration is rendered on top of other decorations
            'z-index': '9999',
            // Scale the decoration to the correct size (upscaled to boost resolution)
            scale: String(1 / pixelRatio),
            'transform-origin': '0px 0px',
            height: 'auto',
            // The decoration will be entirely taken up by the image.
            // Setting the line-height to 0 ensures that there is no additional padding added by the decoration area.
            'line-height': '0',
        })

        this.editor.setDecorations(this.addedLinesDecorationType, [
            {
                range: new vscode.Range(
                    position.line,
                    startLineEndColumn,
                    position.line,
                    startLineEndColumn
                ),
                renderOptions: {
                    before: {
                        color: new vscode.ThemeColor('editorSuggestWidget.foreground'),
                        backgroundColor: new vscode.ThemeColor('editorSuggestWidget.background'),
                        border: '1px solid',
                        borderColor: new vscode.ThemeColor('editorSuggestWidget.border'),
                        textDecoration: `none;${decorationStyle}`,
                        margin: `0 0 0 ${decorationMargin}ch`,
                    },
                    after: {
                        contentText: '\u00A0'.repeat(3) + '\u00A0'.repeat(startLineEndColumn),
                        margin: `0 0 0 ${decorationMargin}ch`,
                    },
                    // Provide different highlighting for dark/light themes
                    dark: { before: { contentIconPath: vscode.Uri.parse(dark) } },
                    light: { before: { contentIconPath: vscode.Uri.parse(light) } },
                },
            },
        ])
        this.editor.setDecorations(this.insertMarkerDecorationType, [
            {
                range: new vscode.Range(position.line, 0, position.line, startLineEndColumn),
            },
        ])
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
