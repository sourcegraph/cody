import { displayPath } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { ThemeColor } from 'vscode'
import { createGitDiff } from '../../../lib/shared/src/editor/create-git-diff'
import { GHOST_TEXT_COLOR } from '../commands/GhostHintDecorator'
import { lines } from '../completions/text-processing'
import {
    type ModifiedLine,
    type ModifiedRange,
    getLineLevelDiff,
    getModifiedRangesForLine,
    splitLineIntoChunks,
} from './diff-utils'
import { autoeditsLogger } from './logger'

/**
 * Represents a proposed text change in the editor.
 */
interface ProposedChange {
    /** The URI of the document for which the change is proposed */
    uri: string
    /** The range in the document that will be modified */
    range: vscode.Range
    /** The text that will replace the content in the range if accepted */
    prediction: string
    /** The renderer responsible for decorating the proposed change */
    renderer: AutoEditsRenderer
}

/**
 * Options for rendering auto-edits in the editor.
 */
export interface AutoEditsManagerOptions {
    /** The document where the auto-edit will be rendered */
    document: vscode.TextDocument
    /** The range in the document that will be modified with the predicted text */
    range: vscode.Range
    /** The predicted text that will replace the current text in the range */
    prediction: string
    /** The current text content of the file */
    currentFileText: string
    /** The predicted/suggested text that will replace the current text */
    predictedFileText: string
}

export interface AutoEditsRendererOptions {
    document: vscode.TextDocument
    currentFileText: string
    predictedFileText: string
}

interface AddedLinesDecorationInfo {
    ranges: [number, number][]
    afterLine: number
    lineText: string
}

export class AutoEditsRendererManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private activeProposedChange: ProposedChange | null = null

    constructor() {
        this.disposables.push(
            vscode.commands.registerCommand('cody.supersuggest.accept', () =>
                this.acceptProposedChange()
            ),
            vscode.commands.registerCommand('cody.supersuggest.dismiss', () =>
                this.dismissProposedChange()
            ),
            vscode.workspace.onDidChangeTextDocument(event => this.onDidChangeTextDocument(event))
        )
    }

    public async displayProposedEdit(options: AutoEditsManagerOptions): Promise<void> {
        await this.dismissProposedChange()
        const editor = vscode.window.activeTextEditor
        if (!editor || options.document !== editor.document) {
            return
        }

        this.activeProposedChange = {
            uri: options.document.uri.toString(),
            range: options.range,
            prediction: options.prediction,
            renderer: new AutoEditsRenderer(editor),
        }
        this.logDiff(
            options.document.uri,
            options.currentFileText,
            options.prediction,
            options.predictedFileText
        )
        await this.activeProposedChange.renderer.renderDecorations({
            document: options.document,
            currentFileText: options.currentFileText,
            predictedFileText: options.predictedFileText,
        })
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
    }

    private async acceptProposedChange(): Promise<void> {
        const editor = vscode.window.activeTextEditor
        if (
            !this.activeProposedChange ||
            !editor ||
            editor.document.uri.toString() !== this.activeProposedChange.uri
        ) {
            await this.dismissProposedChange()
            return
        }
        await editor.edit(editBuilder => {
            editBuilder.replace(this.activeProposedChange!.range, this.activeProposedChange!.prediction)
        })
        await this.dismissProposedChange()
    }

    private async dismissProposedChange(): Promise<void> {
        const renderer = this.activeProposedChange?.renderer
        if (renderer) {
            renderer.clearDecorations()
            renderer.dispose()
        }
        this.activeProposedChange = null
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', false)
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        // Dismiss the proposed change if the document has changed
        this.dismissProposedChange()
    }

    private logDiff(
        uri: vscode.Uri,
        codeToRewrite: string,
        predictedText: string,
        prediction: string
    ): void {
        const predictedCodeXML = `<code>\n${predictedText}\n</code>`
        autoeditsLogger.logDebug('AutoEdits', '(Predicted Code@ Cursor Position)\n', predictedCodeXML)
        const diff = createGitDiff(displayPath(uri), codeToRewrite, prediction)
        autoeditsLogger.logDebug('AutoEdits', '(Diff@ Cursor Position)\n', diff)
    }

    public dispose(): void {
        this.dismissProposedChange()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}

export class AutoEditsRenderer implements vscode.Disposable {
    private readonly decorationTypes: vscode.TextEditorDecorationType[]
    private readonly removedTextDecorationType: vscode.TextEditorDecorationType
    private readonly modifiedTextDecorationType: vscode.TextEditorDecorationType
    private readonly suggesterType: vscode.TextEditorDecorationType
    private readonly hideRemainderDecorationType: vscode.TextEditorDecorationType
    private readonly replacerDecorationType: vscode.TextEditorDecorationType
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
        this.replacerDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'red',
            before: {
                backgroundColor: 'rgb(100, 255, 100, 0.1)',
                color: GHOST_TEXT_COLOR,
                height: '100%',
            },
        })

        // Track all decoration types for disposal
        this.decorationTypes = [
            this.removedTextDecorationType,
            this.modifiedTextDecorationType,
            this.suggesterType,
            this.hideRemainderDecorationType,
            this.replacerDecorationType,
        ]
    }

    public clearDecorations(): void {
        for (const decorationType of this.decorationTypes) {
            this.editor.setDecorations(decorationType, [])
        }
    }

    public async renderDecorations(options: AutoEditsRendererOptions) {
        const beforeLines = lines(options.currentFileText)
        const afterLines = lines(options.predictedFileText)
        const { modifiedLines, removedLines, addedLines } = getLineLevelDiff(beforeLines, afterLines)
        const beforeLineChunks = beforeLines.map(line => splitLineIntoChunks(line))
        const afterLineChunks = afterLines.map(line => splitLineIntoChunks(line))

        let isOnlyAdditionsForModifiedLines = true
        const modifiedRangesMapping = new Map<number, ModifiedRange[]>()
        for (const modifiedLine of modifiedLines) {
            const modifiedRanges = getModifiedRangesForLine(
                beforeLineChunks[modifiedLine.beforeNumber],
                afterLineChunks[modifiedLine.afterNumber]
            )
            modifiedRangesMapping.set(modifiedLine.beforeNumber, modifiedRanges)
            if (isOnlyAdditionsForModifiedLines) {
                isOnlyAdditionsForModifiedLines = modifiedRanges.every(
                    range => range.from1 === range.to1
                )
            }
        }
        this.addDecorations(
            beforeLineChunks,
            afterLineChunks,
            removedLines,
            addedLines,
            modifiedLines,
            modifiedRangesMapping,
            isOnlyAdditionsForModifiedLines
        )

        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
    }

    /**
     * Renders decorations using an inline diff strategy to show changes between two versions of text
     * Split the decorations into three parts:
     * 1. Modified lines: Either show inline ghost text or a combination of ("red" decorations + "green" decorations)
     * 2. Removed lines: Show Inline decoration with "red" marker indicating deletions
     * 3. Added lines: Show Inline decoration with "green" marker indicating additions
     */
    private addDecorations(
        beforeLinesChunks: string[][],
        afterLinesChunks: string[][],
        removedLines: number[],
        addedLines: number[],
        modifiedLines: ModifiedLine[],
        modifiedRangesMapping: Map<number, ModifiedRange[]>,
        isOnlyAdditionsForModifiedLines: boolean
    ): void {
        // 1. For the removed lines, add "red" color decoration
        const removedLinesRanges = this.getNonModifiedLinesRanges(removedLines)
        this.editor.setDecorations(this.removedTextDecorationType, removedLinesRanges)

        if (addedLines.length !== 0 || isOnlyAdditionsForModifiedLines === false) {
            this.renderDiffDecorations(
                beforeLinesChunks,
                afterLinesChunks,
                modifiedLines,
                modifiedRangesMapping,
                addedLines
            )
        } else {
            this.renderInlineGhostTextDecorations(
                beforeLinesChunks,
                afterLinesChunks,
                modifiedLines,
                modifiedRangesMapping
            )
        }
    }

    private renderDiffDecorations(
        beforeLinesChunks: string[][],
        afterLinesChunks: string[][],
        modifiedLines: ModifiedLine[],
        modifiedRangesMapping: Map<number, ModifiedRange[]>,
        addedLines: number[]
    ): void {
        // Display the removed range decorations
        const removedRanges: vscode.Range[] = []
        const addedLinesInfo: AddedLinesDecorationInfo[] = []

        let firstModifiedLineMatch: {
            beforeLine: number
            afterLine: number
        } | null = null

        // Handle modified lines - collect removed ranges and added decorations
        for (const modifiedLine of modifiedLines) {
            const modifiedRanges = modifiedRangesMapping.get(modifiedLine.beforeNumber)
            if (!modifiedRanges) {
                continue
            }
            const addedRanges: [number, number][] = []
            for (const range of modifiedRanges) {
                // Removed from the original text
                if (range.to1 > range.from1) {
                    const startRange = this.getIndexFromLineChunks(
                        beforeLinesChunks[modifiedLine.beforeNumber],
                        range.from1
                    )
                    const endRange = this.getIndexFromLineChunks(
                        beforeLinesChunks[modifiedLine.beforeNumber],
                        range.to1
                    )
                    removedRanges.push(
                        new vscode.Range(
                            modifiedLine.beforeNumber,
                            startRange,
                            modifiedLine.beforeNumber,
                            endRange
                        )
                    )
                }
                // Addition from the predicted text
                if (range.to2 > range.from2) {
                    const startRange = this.getIndexFromLineChunks(
                        afterLinesChunks[modifiedLine.afterNumber],
                        range.from2
                    )
                    const endRange = this.getIndexFromLineChunks(
                        afterLinesChunks[modifiedLine.afterNumber],
                        range.to2
                    )
                    addedRanges.push([startRange, endRange])
                }
            }
            if (addedRanges.length > 0) {
                firstModifiedLineMatch = {
                    beforeLine: modifiedLine.beforeNumber,
                    afterLine: modifiedLine.afterNumber,
                }
                addedLinesInfo.push({
                    ranges: addedRanges,
                    afterLine: modifiedLine.afterNumber,
                    lineText: afterLinesChunks[modifiedLine.afterNumber].join(''),
                })
            }
        }
        this.editor.setDecorations(this.modifiedTextDecorationType, removedRanges)

        // Handle fully added lines
        for (const addedLine of addedLines) {
            const addedLineText = afterLinesChunks[addedLine].join('')
            addedLinesInfo.push({
                ranges: [[0, addedLineText.length]],
                afterLine: addedLine,
                lineText: addedLineText,
            })
        }

        // Fill in any gaps in line numbers with empty ranges
        const lineNumbers = addedLinesInfo.map(d => d.afterLine)
        const min = Math.min(...lineNumbers)
        const max = Math.max(...lineNumbers)

        for (let i = min; i <= max; i++) {
            if (!lineNumbers.includes(i)) {
                addedLinesInfo.push({
                    ranges: [],
                    afterLine: i,
                    lineText: afterLinesChunks[i].join(''),
                })
            }
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

        const bufferReplacerCol = 5
        const replacerCol = Math.min(
            Math.max(
                ...beforeLinesChunks
                    .slice(startLine, startLine + addedLinesInfo.length)
                    .map(line => line.join('').length)
            ) + bufferReplacerCol,
            80 // todo (hitesh): fallback value, set based on the visible range of the editor
        )
        // todo (hitesh): handle case when too many lines to fit in the editor
        this.renderAddedLinesDecorations(addedLinesInfo, startLine, replacerCol)
    }

    private renderAddedLinesDecorations(
        addedLinesInfo: AddedLinesDecorationInfo[],
        startLine: number,
        replacerCol: number
    ): void {
        const replacerDecorations: vscode.DecorationOptions[] = []

        for (let i = 0; i < addedLinesInfo.length; i++) {
            const j = i + startLine
            const line = this.editor.document.lineAt(j)
            const decoration = addedLinesInfo[i]

            if (line.range.end.character <= replacerCol) {
                replacerDecorations.push({
                    range: new vscode.Range(j, line.range.end.character, j, line.range.end.character),
                    renderOptions: {
                        before: {
                            contentText:
                                '\u00A0'.repeat(3) +
                                replaceLeadingChars(decoration.lineText, ' ', '\u00A0'),
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
                                '\u00A0' + replaceLeadingChars(decoration.lineText, ' ', '\u00A0'),
                        },
                    },
                })
            }
        }
        this.editor.setDecorations(this.replacerDecorationType, replacerDecorations)
    }

    private renderInlineGhostTextDecorations(
        beforeLinesChunks: string[][],
        afterLinesChunks: string[][],
        modifiedLines: ModifiedLine[],
        modifiedRangesMapping: Map<number, ModifiedRange[]>
    ): void {
        const inlineModifiedRanges: vscode.DecorationOptions[] = []
        for (const modifiedLine of modifiedLines) {
            const modifiedRanges = modifiedRangesMapping.get(modifiedLine.beforeNumber)
            if (!modifiedRanges) {
                continue
            }
            for (const range of modifiedRanges) {
                const rangeText = afterLinesChunks[modifiedLine.afterNumber]
                    .slice(range.from2, range.to2)
                    .join('')
                const startRange = this.getIndexFromLineChunks(
                    beforeLinesChunks[modifiedLine.beforeNumber],
                    range.from1
                )
                const endRange = this.getIndexFromLineChunks(
                    beforeLinesChunks[modifiedLine.beforeNumber],
                    range.to1
                )

                inlineModifiedRanges.push({
                    range: new vscode.Range(
                        modifiedLine.beforeNumber,
                        startRange,
                        modifiedLine.beforeNumber,
                        endRange
                    ),
                    renderOptions: {
                        after: {
                            contentText: rangeText,
                        },
                    },
                })
            }
        }
        this.editor.setDecorations(this.suggesterType, inlineModifiedRanges)
    }

    private getIndexFromLineChunks(parts: string[], index: number): number {
        return parts.slice(0, index).reduce((acc: number, str: string) => acc + str.length, 0)
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
 * Replaces leading occurrences of a character with another string
 * @param str The input string to process
 * @param oldS The character to replace
 * @param newS The character/string to replace with
 * @returns The string with leading characters replaced
 */
function replaceLeadingChars(str: string, oldS: string, newS: string): string {
    for (let i = 0; i < str.length; i++) {
        if (str[i] !== oldS) {
            // a string that is `newS` repeated i times
            return newS.repeat(i) + str.substring(i)
        }
    }
    return str
}
