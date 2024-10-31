import { displayPath } from '@sourcegraph/cody-shared'
import { structuredPatch } from 'diff'
import * as vscode from 'vscode'
import { ThemeColor } from 'vscode'
import { createGitDiff } from '../../../lib/shared/src/editor/create-git-diff'
import { GHOST_TEXT_COLOR } from '../commands/GhostHintDecorator'
import { calculateRemovedRanges, isPureAddedLines } from './diff-utils'
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
        this.renderRemovedLinesDecorations(
            options.document,
            options.currentFileText,
            options.predictedFileText
        )
        const isPureAdded = isPureAddedLines(options.currentFileText, options.predictedFileText)
        if (isPureAdded) {
            this.renderAddedLinesDecorationsForNewLineAdditions(
                options.document,
                options.predictedFileText,
                0
            )
        } else {
            this.renderAddedLinesDecorations(
                options.document,
                options.currentFileText,
                options.predictedFileText
            )
        }
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
    }

    public renderAddedLinesDecorationsForNewLineAdditions(
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

    public renderAddedLinesDecorations(
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

    public renderRemovedLinesDecorations(
        document: vscode.TextDocument,
        currentFileText: string,
        predictedFileText: string
    ) {
        if (this.editor.document !== document) {
            return
        }
        const allRangesToRemove = calculateRemovedRanges(document, currentFileText, predictedFileText)
        this.editor.setDecorations(this.removedTextDecorationType, allRangesToRemove)
    }

    public dispose(): void {
        // Dispose all decoration types
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
