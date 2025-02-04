import * as vscode from 'vscode'

import { GHOST_TEXT_COLOR } from '../../../commands/GhostHintDecorator'

import { getEditorInsertSpaces, getEditorTabSize } from '@sourcegraph/cody-shared'
import { generateSuggestionAsImage } from '../image-gen'
import type { AutoEditsDecorator, DecorationInfo, ModifiedLineInfo } from './base'
import { UNICODE_SPACE, blockify } from './blockify'
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
    /** Starting line number for the decoration */
    startLine: number
    /** Column position for the replacement text */
    replacerCol: number
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

interface DefaultDecoratorOptions {
    /** Experimentally render added lines as images in the editor */
    shouldRenderImage?: boolean
}

export class DefaultDecorator implements AutoEditsDecorator {
    private readonly decorationTypes: vscode.TextEditorDecorationType[]
    private readonly editor: vscode.TextEditor
    private readonly options: DefaultDecoratorOptions

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

    constructor(editor: vscode.TextEditor, options: DefaultDecoratorOptions = {}) {
        this.editor = editor
        this.options = options

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

    public canRenderDecoration(decorationInfo: DecorationInfo): boolean {
        if (this.options.shouldRenderImage) {
            // Image decorations can expand beyond the editor boundaries, so we can always render them.
            return true
        }

        if (!this.diffDecorationInfo) {
            this.diffDecorationInfo = this.getDiffDecorationsInfo(decorationInfo)
        }

        const { addedLinesInfo } = this.diffDecorationInfo
        if (addedLinesInfo) {
            // Check if there are enough lines in the editor to render the diff decorations
            if (
                addedLinesInfo.startLine + addedLinesInfo.addedLinesDecorationInfo.length >
                this.editor.document.lineCount
            ) {
                return false
            }
        }
        return true
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

        if (this.options.shouldRenderImage) {
            this.renderAddedLinesImageDecorations(
                addedLinesInfo.addedLinesDecorationInfo,
                addedLinesInfo.startLine,
                addedLinesInfo.replacerCol
            )
            return
        }

        this.renderAddedLinesDecorations(
            addedLinesInfo.addedLinesDecorationInfo,
            addedLinesInfo.startLine,
            addedLinesInfo.replacerCol
        )
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
        const oldLines = addedLinesInfo
            .filter(info => info.afterLine < this.editor.document.lineCount)
            .map(info => this.editor.document.lineAt(info.afterLine))

        const replacerCol = Math.max(...oldLines.map(line => this.getEndColumn(line)))
        const startLine = Math.min(...oldLines.map(line => line.lineNumber))

        return {
            removedRangesInfo: removedRanges,
            addedLinesInfo: {
                addedLinesDecorationInfo: addedLinesInfo,
                startLine,
                replacerCol,
            },
        }
    }

    private getEndColumn(line: vscode.TextLine): number {
        const insertSpaces = getEditorInsertSpaces(
            this.editor.document.uri,
            vscode.workspace,
            vscode.window
        )
        if (insertSpaces) {
            // We can reliably use the range position for files using space characters
            return line.range.end.character
        }

        // For files using tab-based indentation, we need special handling.
        // VSCode's Range API doesn't account for tab display width
        // We need to:
        // 1. Convert tabs to spaces based on editor tab size
        // 2. Calculate the visual width including both indentation and content
        const tabSize = getEditorTabSize(this.editor.document.uri, vscode.workspace, vscode.window)
        const tabAsSpace = UNICODE_SPACE.repeat(tabSize)
        const firstNonWhitespaceCharacterIndex = line.firstNonWhitespaceCharacterIndex
        const indentationText = line.text.substring(0, firstNonWhitespaceCharacterIndex)
        const spaceAdjustedEndCharacter =
            indentationText.replaceAll(/\t/g, tabAsSpace).length +
            (line.text.length - firstNonWhitespaceCharacterIndex)

        return spaceAdjustedEndCharacter
    }

    private renderAddedLinesDecorations(
        addedLinesInfo: AddedLinesDecorationInfo[],
        startLine: number,
        replacerCol: number
    ): void {
        // Blockify the added lines so they are suitable to be rendered together as a VS Code decoration
        const blockifiedAddedLines = blockify(this.editor.document, addedLinesInfo)

        const replacerDecorations: vscode.DecorationOptions[] = []
        for (let i = 0; i < blockifiedAddedLines.length; i++) {
            const j = i + startLine
            const line = this.editor.document.lineAt(j)
            const lineReplacerCol = this.getEndColumn(line)
            const decoration = blockifiedAddedLines[i]
            const decorationStyle = cssPropertiesToString({
                // Absolutely position the suggested code so that the cursor does not jump there
                position: 'absolute',
                // Due the the absolute position, the decoration may interfere with other decorations (e.g. GitLens)
                // Apply a background blur to avoid interference
                'backdrop-filter': 'blur(5px)',
            })

            if (replacerCol >= lineReplacerCol) {
                replacerDecorations.push({
                    range: new vscode.Range(j, line.range.end.character, j, line.range.end.character),
                    renderOptions: {
                        // Show the suggested code but keep it positioned absolute to ensure
                        // the cursor does not jump there.
                        before: {
                            contentText: UNICODE_SPACE.repeat(3) + decoration.lineText,
                            margin: `0 0 0 ${replacerCol - lineReplacerCol}ch`,
                            textDecoration: `none;${decorationStyle}`,
                        },
                        // Create an empty HTML element with the width required to show the suggested code.
                        // Required to make the viewport scrollable to view the suggestion if it's outside.
                        after: {
                            contentText:
                                UNICODE_SPACE.repeat(3) +
                                decoration.lineText.replace(/\S/g, UNICODE_SPACE),
                            margin: `0 0 0 ${replacerCol - lineReplacerCol}ch`,
                        },
                    },
                })
            } else {
                replacerDecorations.push({
                    range: new vscode.Range(j, replacerCol, j, replacerCol),
                    renderOptions: {
                        before: {
                            contentText: UNICODE_SPACE + decoration.lineText,
                            textDecoration: `none;${decorationStyle}`,
                        },
                        after: {
                            contentText:
                                UNICODE_SPACE.repeat(3) +
                                decoration.lineText.replace(/\S/g, UNICODE_SPACE),
                        },
                    },
                })
            }
        }
    }

    private renderAddedLinesImageDecorations(
        addedLinesInfo: AddedLinesDecorationInfo[],
        startLine: number,
        replacerCol: number
    ): void {
        // Blockify the added lines so they are suitable to be rendered together as a VS Code decoration
        const blockifiedAddedLines = blockify(this.editor.document, addedLinesInfo)

        const { dark, light } = generateSuggestionAsImage({
            decorations: blockifiedAddedLines,
            lang: this.editor.document.languageId,
        })
        const startLineEndColumn = this.getEndColumn(this.editor.document.lineAt(startLine))

        // The padding in which to offset the decoration image away from neighbouring code
        const decorationPadding = 4
        // The margin position where the decoration image should render.
        // Ensuring it does not conflict with the visibility of existing code.
        const decorationMargin = replacerCol - startLineEndColumn + decorationPadding
        const decorationStyle = cssPropertiesToString({
            // Absolutely position the suggested code so that the cursor does not jump there
            position: 'absolute',
            // Make sure the decoration is rendered on top of other decorations
            'z-index': '9999',
            // Scale to decoration to the correct size (upscaled to boost resolution)
            scale: '0.5',
            'transform-origin': '0px 0px',
            height: 'auto',
        })

        this.editor.setDecorations(this.addedLinesDecorationType, [
            {
                range: new vscode.Range(startLine, startLineEndColumn, startLine, startLineEndColumn),
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
                range: new vscode.Range(startLine, 0, startLine, startLineEndColumn),
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
