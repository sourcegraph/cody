import { displayPath } from '@sourcegraph/cody-shared'
import { structuredPatch } from 'diff'
import * as vscode from 'vscode'
import { ThemeColor } from 'vscode'
import { createGitDiff } from '../../../lib/shared/src/editor/create-git-diff'
import { GHOST_TEXT_COLOR } from '../commands/GhostHintDecorator'
import {calculateRemovedRanges, isPureAddedLines, getLineLevelDiff, ModifiedLine, ModifiedRanges, getModifiedRangesForLine} from './diff-utils';
import { autoeditsLogger } from './logger'
import { lines } from '../completions/text-processing'

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

interface DecorationLine {
    line: number
    text: string
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
        this.renderDecorationsInlineStrategy(beforeLines, afterLines, modifiedLines, removedLines, addedLines)

        // this.renderRemovedLinesDecorations(
        //     options.document,
        //     options.currentFileText,
        //     options.predictedFileText
        // )
        // const isPureAdded = isPureAddedLines(options.currentFileText, options.predictedFileText)
        // if (isPureAdded) {
        //     this.renderAddedLinesDecorationsForNewLineAdditions(
        //         options.document,
        //         options.predictedFileText,
        //         0
        //     )
        // } else {
        //     this.renderAddedLinesDecorations(
        //         options.document,
        //         options.currentFileText,
        //         options.predictedFileText
        //     )
        // }
        // await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
    }

    private renderAddedLinesDecorationsForNewLineAdditions(
        document: vscode.TextDocument,
        predictedText: string,
        replaceStartLine: number,
        replacerCol = 80
    ) {
        if (this.editor.document !== document) {
            return
        }
        const replacerText = predictedText
        const replacerDecorations: vscode.DecorationOptions[] = []
        // TODO(beyang): handle when not enough remaining lines in the doc
        for (let i = 0; i < replacerText.split('\n').length; i++) {
            if (i > 5)
                break

            const j = i + replaceStartLine
            const line = this.editor.document.lineAt(j)
            if (line.range.end.character <= replacerCol) {
                const replacerOptions: vscode.DecorationOptions = {
                    range: new vscode.Range(j, line.range.end.character, j, line.range.end.character),
                    renderOptions: {
                        before: {
                            contentText:
                                '\u00A0'.repeat(3) +
                                replaceLeadingChars(replacerText.split('\n')[i], ' ', '\u00A0'), // TODO(beyang): factor out
                            margin: `0 0 0 ${replacerCol - line.range.end.character}ch`,
                        },
                    },
                }
                replacerDecorations.push(replacerOptions)
            } else {
                const replacerOptions: vscode.DecorationOptions = {
                    range: new vscode.Range(j, replacerCol, j, replacerCol),
                    renderOptions: {
                        before: {
                            contentText:
                                '\u00A0' +
                                replaceLeadingChars(replacerText.split('\n')[i], ' ', '\u00A0'), // TODO(beyang): factor out
                        },
                    },
                }
                replacerDecorations.push(replacerOptions)
            }
        }
        this.editor.setDecorations(this.replacerDecorationType, replacerDecorations)
    }

    private renderAddedLinesDecorations(
        document: vscode.TextDocument,
        currentFileText: string,
        predictedFileText: string
    ) {
        if (this.editor.document !== document) {
            return
        }
        const filename = displayPath(document.uri)
        const patch = structuredPatch(
            `a/${filename}`,
            `b/${filename}`,
            currentFileText,
            predictedFileText
        )
        const addedLines: DecorationLine[] = []
        for (const hunk of patch.hunks) {
            let oldLineNumber = hunk.oldStart
            let newLineNumber = hunk.newStart
            for (const line of hunk.lines) {
                if (line.length === 0) {
                    continue
                }
                if (line[0] === '-') {
                    oldLineNumber++
                } else if (line[0] === '+') {
                    addedLines.push({ line: newLineNumber - 1, text: line.slice(1) })
                    newLineNumber++
                } else if (line[0] === ' ') {
                    oldLineNumber++
                    newLineNumber++
                }
            }
        }
        this.editor.setDecorations(
            this.suggesterType,
            addedLines.map(line => ({
                range: new vscode.Range(line.line, 0, line.line, document.lineAt(line.line).text.length),
                renderOptions: {
                    after: {
                        contentText: line.text,
                        backgroundColor: new ThemeColor('diffEditor.insertedTextBackground'),
                    },
                },
            }))
        )
    }

    /**
     * Renders decorations using an inline diff strategy to show changes between two versions of text
     * Split the decorations into three parts:
     * 1. Modified lines: Either show inline ghost text or a combination of ("red" decorations + "green" decorations)
     * 2. Removed lines: Show Inline decoration with "red" marker indicating deletions
     * 3. Added lines: Show Inline decoration with "green" marker indicating additions
     * @param beforeLines Array of lines from the original text
     * @param afterLines Array of lines from the modified text
     * @param modifiedLines Array of line numbers that were modified between versions
     * @param removedLines Array of line numbers that were removed from original text
     * @param addedLines Array of line numbers that were added in modified text
     */
    private renderDecorationsInlineStrategy(
        beforeLines: string[],
        afterLines: string[],
        modifiedLines: ModifiedLine[],
        removedLines: number[],
        addedLines: number[]
    ) {
        let isOnlyAdditionsForModifiedLines = true
        const modifiedRangesMapping = new Map<number, ModifiedRanges>()
        for (const modifiedLine of modifiedLines) {
            const modifiedRanges = getModifiedRangesForLine(beforeLines[modifiedLine.beforeNumber], afterLines[modifiedLine.afterNumber])
            modifiedRangesMapping.set(modifiedLine.beforeNumber, modifiedRanges)
            if (modifiedRanges.deletedRanges.length > 0) {
                isOnlyAdditionsForModifiedLines = false
            }
        }
        if (addedLines.length !== 0 || isOnlyAdditionsForModifiedLines === false) {

        } else {
            this.decorateInlineLikeDecorations(afterLines, removedLines, modifiedLines, modifiedRangesMapping)
        }
    }

    private decorateInlineLikeDecorations(afterLines: string[], removedLines: number[], modifiedLines: ModifiedLine[], modifiedRangesMapping: Map<number, ModifiedRanges>): void {
        const removedLinesRanges = this.getNonModifiedLinesRanges(removedLines)
        const inlineModifiedRanges: vscode.DecorationOptions[] = []
        for (const modifiedLine of modifiedLines) {
            const addedRanges = modifiedRangesMapping.get(modifiedLine.beforeNumber)?.addedRanges
            if (!addedRanges) {
                continue
            }
            for (const range of addedRanges) {
                // todo: handle when the modified lines are split by words
                const rangeText = afterLines[modifiedLine.afterNumber].slice(range[0], range[1])
                inlineModifiedRanges.push({
                    range: new vscode.Range(modifiedLine.beforeNumber, range[0], modifiedLine.beforeNumber, range[1]),
                    renderOptions: {
                        before: {
                            contentText: rangeText
                        },
                    },
                })
            }
        }
        this.editor.setDecorations(this.suggesterType, inlineModifiedRanges)
        this.editor.setDecorations(this.removedTextDecorationType, removedLinesRanges)
    }

    private getNonModifiedLinesRanges(lineNumbers: number[]): vscode.Range[] {
        // Get the ranges of the lines that are not modified, i.e. fully removed or added lines
        return lineNumbers.map(line => new vscode.Range(line, 0, line, this.editor.document.lineAt(line).text.length))
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
