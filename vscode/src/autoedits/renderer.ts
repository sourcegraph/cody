import * as vscode from 'vscode'
import { ThemeColor } from 'vscode'
import { GHOST_TEXT_COLOR } from '../commands/GhostHintDecorator'
import { lines } from '../completions/text-processing'
import {
    type ModifiedLine,
    type ModifiedRange,
    getLineLevelDiff,
    getModifiedRangesForLine,
    splitLineIntoChunks,
} from './diff-utils'

/**
 * Represents a proposed text change in the editor.
 */
interface ProposedChange {
    // The URI of the document for which the change is proposed
    uri: string

    // The range in the document that will be modified
    range: vscode.Range

    // The text that will replace the content in the range if accepted
    prediction: string

    // The renderer responsible for decorating the proposed change
    renderer: AutoEditsRenderer
}

/**
 * Options for rendering auto-edits in the editor.
 */
export interface AutoEditsManagerOptions {
    // The document where the auto-edit will be rendered
    document: vscode.TextDocument

    // The range in the document that will be modified with the predicted text
    range: vscode.Range

    // The predicted text that will replace the current text in the range
    prediction: string

    // The current text content of the file
    currentFileText: string

    // The predicted/suggested text that will replace the current text
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
    // Keeps track of the current active edit (there can only be one active edit at a time)
    private activeEdit: ProposedChange | null = null

    private disposables: vscode.Disposable[] = []

    constructor() {
        this.disposables.push(
            vscode.commands.registerCommand('cody.supersuggest.accept', () => this.acceptEdit()),
            vscode.commands.registerCommand('cody.supersuggest.dismiss', () => this.dismissEdit()),
            vscode.workspace.onDidChangeTextDocument(event => this.onDidChangeTextDocument(event)),
            vscode.window.onDidChangeTextEditorSelection(event =>
                this.onDidChangeTextEditorSelection(event)
            ),
            vscode.window.onDidChangeActiveTextEditor(editor =>
                this.onDidChangeActiveTextEditor(editor)
            ),
            vscode.workspace.onDidCloseTextDocument(document => this.onDidCloseTextDocument(document))
        )
    }

    public hasActiveEdit(): boolean {
        return this.activeEdit !== null
    }

    public async showEdit(options: AutoEditsManagerOptions): Promise<void> {
        await this.dismissEdit()
        const editor = vscode.window.activeTextEditor
        if (!editor || options.document !== editor.document) {
            return
        }
        this.activeEdit = {
            uri: options.document.uri.toString(),
            range: options.range,
            prediction: options.prediction,
            renderer: new AutoEditsRenderer(editor),
        }
        this.activeEdit.renderer.renderDecorations({
            document: options.document,
            currentFileText: options.currentFileText,
            predictedFileText: options.predictedFileText,
        })
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
    }

    private async dismissEdit(): Promise<void> {
        const renderer = this.activeEdit?.renderer
        if (renderer) {
            renderer.clearDecorations()
            renderer.dispose()
        }
        this.activeEdit = null
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', false)
    }

    private async acceptEdit(): Promise<void> {
        const editor = vscode.window.activeTextEditor
        if (!this.activeEdit || !editor || editor.document.uri.toString() !== this.activeEdit.uri) {
            await this.dismissEdit()
            return
        }
        await editor.edit(editBuilder => {
            editBuilder.replace(this.activeEdit!.range, this.activeEdit!.prediction)
        })
        await this.dismissEdit()
    }

    private async onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): Promise<void> {
        // Only dismiss if we have an active suggestion and the changed document matches
        // else, we will falsely discard the suggestion on unrelated changes such as changes in output panel.
        if (event.document.uri.toString() !== this.activeEdit?.uri) {
            return
        }
        await this.dismissEdit()
    }

    private async onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined): Promise<void> {
        if (!editor || editor.document.uri.toString() !== this.activeEdit?.uri) {
            await this.dismissEdit()
        }
    }

    private async onDidCloseTextDocument(document: vscode.TextDocument): Promise<void> {
        if (document.uri.toString() === this.activeEdit?.uri) {
            await this.dismissEdit()
        }
    }

    private async onDidChangeTextEditorSelection(
        event: vscode.TextEditorSelectionChangeEvent
    ): Promise<void> {
        if (event.textEditor.document.uri.toString() !== this.activeEdit?.uri) {
            return
        }
        const currentSelectionRange = event.selections.at(-1)
        if (!currentSelectionRange?.intersection(this.activeEdit.range)) {
            await this.dismissEdit()
        }
    }

    public dispose(): void {
        this.dismissEdit()
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

    public clearDecorations(): void {
        for (const decorationType of this.decorationTypes) {
            this.editor.setDecorations(decorationType, [])
        }
    }

    public renderDecorations(options: AutoEditsRendererOptions): void {
        const oldLines = lines(options.currentFileText)
        const newLines = lines(options.predictedFileText)
        const { modifiedLines, removedLines, addedLines } = getLineLevelDiff(oldLines, newLines)
        const oldLinesChunks = oldLines.map(line => splitLineIntoChunks(line))
        const newLinesChunks = newLines.map(line => splitLineIntoChunks(line))

        // TODO(beyang): factor out and test
        let isOnlyAdditionsForModifiedLines = true
        const modifiedRangesMapping = new Map<number, ModifiedRange[]>()
        for (const modifiedLine of modifiedLines) {
            const modifiedRanges = getModifiedRangesForLine(
                oldLinesChunks[modifiedLine.beforeNumber],
                newLinesChunks[modifiedLine.afterNumber]
            )
            modifiedRangesMapping.set(modifiedLine.beforeNumber, modifiedRanges)
            if (isOnlyAdditionsForModifiedLines) {
                isOnlyAdditionsForModifiedLines = modifiedRanges.every(
                    range => range.from1 === range.to1
                )
            }
        }
        this.addDecorations(
            oldLinesChunks,
            newLinesChunks,
            removedLines,
            addedLines,
            modifiedLines,
            modifiedRangesMapping,
            isOnlyAdditionsForModifiedLines
        )
    }

    /**
     * Renders decorations using an inline diff strategy to show changes between two versions of text
     * Split the decorations into three parts:
     * 1. Modified lines: Either show inline ghost text or a combination of ("red" decorations + "green" decorations)
     * 2. Removed lines: Show Inline decoration with "red" marker indicating deletions
     * 3. Added lines: Show Inline decoration with "green" marker indicating additions
     */
    private addDecorations(
        oldLinesChunks: string[][],
        newLinesChunks: string[][],
        removedLines: number[],
        addedLines: number[],
        modifiedLines: ModifiedLine[],
        modifiedRangesMapping: Map<number, ModifiedRange[]>,
        isOnlyAdditionsForModifiedLines: boolean
    ): void {
        // 1. For the removed lines, add "red" color decoration
        const removedLinesRanges = this.getNonModifiedLinesRanges(removedLines)
        this.editor.setDecorations(this.removedTextDecorationType, removedLinesRanges)

        if (addedLines.length > 0 || !isOnlyAdditionsForModifiedLines) {
            this.renderDiffDecorations(
                oldLinesChunks,
                newLinesChunks,
                modifiedLines,
                modifiedRangesMapping,
                addedLines
            )
        } else {
            this.renderInlineGhostTextDecorations(
                oldLinesChunks,
                newLinesChunks,
                modifiedLines,
                modifiedRangesMapping
            )
        }
    }

    private renderDiffDecorations(
        oldLinesChunks: string[][],
        newLinesChunks: string[][],
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
                        oldLinesChunks[modifiedLine.beforeNumber],
                        range.from1
                    )
                    const endRange = this.getIndexFromLineChunks(
                        oldLinesChunks[modifiedLine.beforeNumber],
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
                        newLinesChunks[modifiedLine.afterNumber],
                        range.from2
                    )
                    const endRange = this.getIndexFromLineChunks(
                        newLinesChunks[modifiedLine.afterNumber],
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
                    lineText: newLinesChunks[modifiedLine.afterNumber].join(''),
                })
            }
        }
        this.editor.setDecorations(this.modifiedTextDecorationType, removedRanges)

        // Handle fully added lines
        for (const addedLine of addedLines) {
            const addedLineText = newLinesChunks[addedLine].join('')
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
                    lineText: newLinesChunks[i].join(''),
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

        const replacerCol = Math.max(
            ...oldLinesChunks
                .slice(startLine, startLine + addedLinesInfo.length)
                .map(line => line.join('').length)
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
                        before: {
                            contentText:
                                '\u00A0'.repeat(3) +
                                _replaceLeadingTrailingChars(decoration.lineText, ' ', '\u00A0'),
                            margin: `0 0 0 ${replacerCol - line.range.end.character}ch`,
                            textDecoration: 'none; position: absolute;',
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
                        before: {
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
