import { displayPath, logDebug } from '@sourcegraph/cody-shared'
import { structuredPatch } from 'diff'
import { diff } from 'fast-myers-diff'
import * as vscode from 'vscode'
import { ThemeColor } from 'vscode'
import { createGitDiff } from '../../../lib/shared/src/editor/create-git-diff'
import { GHOST_TEXT_COLOR } from '../commands/GhostHintDecorator'
import type { AutoEditsProviderOptions } from './autoedits-provider'
import type { CodeToReplaceData } from './prompt-utils'
import { combineRanges } from './utils'

interface ProposedChange {
    range: vscode.Range
    newText: string
}

interface DecorationLine {
    line: number
    text: string
}

const removedTextDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new ThemeColor('diffEditor.removedTextBackground'),
})

const suggesterType = vscode.window.createTextEditorDecorationType({
    before: { color: GHOST_TEXT_COLOR },
    after: { color: GHOST_TEXT_COLOR },
})

const hideRemainderDecorationType = vscode.window.createTextEditorDecorationType({
    opacity: '0',
})

const replacerBackgroundColor = 'rgb(100, 255, 100, 0.1)'
const replacerDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'red',
    before: {
        backgroundColor: replacerBackgroundColor,
        color: GHOST_TEXT_COLOR,
        height: '100%',
    },
})

export class AutoEditsRenderer implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private activeProposedChange: ProposedChange | null = null

    constructor() {
        this.disposables.push(
            vscode.commands.registerCommand('cody.supersuggest.accept', () =>
                this.acceptProposedChange()
            )
        )
        this.disposables.push(
            vscode.commands.registerCommand('cody.supersuggest.dismiss', () =>
                this.dismissProposedChange()
            )
        )
    }

    public async render(
        options: AutoEditsProviderOptions,
        codeToReplace: CodeToReplaceData,
        predictedText: string
    ) {
        if (this.activeProposedChange) {
            await this.dismissProposedChange()
        }
        const editor = vscode.window.activeTextEditor
        const document = editor?.document
        if (!editor || !document) {
            return
        }

        const range = new vscode.Range(
            new vscode.Position(codeToReplace.startLine, 0),
            document.lineAt(codeToReplace.endLine).rangeIncludingLineBreak.end
        )
        this.activeProposedChange = {
            range,
            newText: predictedText,
        }

        const currentFileText = options.document.getText()
        const predictedFileText =
            currentFileText.slice(0, document.offsetAt(range.start)) +
            predictedText +
            currentFileText.slice(document.offsetAt(range.end))

        this.logDiff(options.document.uri, currentFileText, predictedText, predictedFileText)

        // Add decorations for the removed lines
        this.renderRemovedLinesDecorations(editor, currentFileText, predictedFileText, document)

        const isPureAddedLine = this.isPureAddedLinesInDiff(currentFileText, predictedFileText)
        if (isPureAddedLine) {
            this.renderAddedLinesDecorationsForNewLineAdditions(
                editor,
                predictedText,
                codeToReplace.startLine
            )
        } else {
            this.renderAddedLinesDecorations(editor, currentFileText, predictedFileText, document)
        }
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
    }

    public isPureAddedLinesInDiff(currentFileText: string, predictedFileText: string): boolean {
        const currentLines = currentFileText.split('\n')
        const predictedLines = predictedFileText.split('\n')
        for (const [from1, to1, from2, to2] of diff(currentLines, predictedLines)) {
            if (to2 - to1 > from2 - from1) {
                return true
            }
        }
        return false
    }

    public renderAddedLinesDecorationsForNewLineAdditions(
        editor: vscode.TextEditor,
        predictedText: string,
        replaceStartLine: number,
        replacerCol = 80
    ) {
        const replacerText = predictedText
        const replacerDecorations: vscode.DecorationOptions[] = []
        // TODO(beyang): handle when not enough remaining lines in the doc
        for (let i = 0; i < replacerText.split('\n').length; i++) {
            const j = i + replaceStartLine
            const line = editor.document.lineAt(j)
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
        editor.setDecorations(replacerDecorationType, replacerDecorations)
    }

    public renderAddedLinesDecorations(
        editor: vscode.TextEditor,
        currentFileText: string,
        predictedFileText: string,
        document: vscode.TextDocument
    ) {
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
        editor.setDecorations(
            suggesterType,
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
        editor: vscode.TextEditor,
        currentFileText: string,
        predictedFileText: string,
        document: vscode.TextDocument
    ) {
        const edits = diff(currentFileText, predictedFileText)
        const allRangesToRemove: vscode.Range[] = []
        for (const [from1, to1] of edits) {
            const startPos = document.positionAt(from1)
            const endPos = document.positionAt(to1)
            allRangesToRemove.push(new vscode.Range(startPos, endPos))
        }
        const combinedRangesToRemove = combineRanges(allRangesToRemove, 0)
        editor.setDecorations(removedTextDecorationType, combinedRangesToRemove)
    }

    async acceptProposedChange(): Promise<void> {
        if (this.activeProposedChange === null) {
            return
        }
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            await this.dismissProposedChange()
            return
        }
        const currentActiveChange = this.activeProposedChange
        await editor.edit(editBuilder => {
            editBuilder.replace(currentActiveChange.range, currentActiveChange.newText)
        })
        await this.dismissProposedChange()
    }

    async dismissProposedChange(): Promise<void> {
        this.activeProposedChange = null
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', false)
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }
        editor.setDecorations(removedTextDecorationType, [])
        editor.setDecorations(suggesterType, [])
        editor.setDecorations(replacerDecorationType, [])
    }

    private logDiff(uri: vscode.Uri, codeToRewrite: string, predictedText: string, prediction: string) {
        const predictedCodeXML = `<code>\n${predictedText}\n</code>`
        logDebug('AutoEdits', '(Predicted Code@ Cursor Position)\n', predictedCodeXML)
        const diff = createGitDiff(displayPath(uri), codeToRewrite, prediction)
        logDebug('AutoEdits', '(Diff@ Cursor Position)\n', diff)
    }

    public dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose()
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
