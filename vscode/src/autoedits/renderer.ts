import { displayPath, logDebug } from '@sourcegraph/cody-shared'
import { structuredPatch } from 'diff'
import * as vscode from 'vscode'
import { createGitDiff } from '../../../lib/shared/src/editor/create-git-diff'
import { GHOST_TEXT_COLOR } from '../commands/GhostHintDecorator'
import type { AutoEditsProviderOptions } from './autoedits-provider'
import type { CodeToReplaceData } from './prompt-utils'
import { ThemeColor } from 'vscode'
import { calcPatch, calcSlices, diff } from 'fast-myers-diff'


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

function combineRanges(ranges: vscode.Range[], n: number): vscode.Range[] {
    if (ranges.length === 0) return [];

    // Sort ranges by start position
    const sortedRanges = ranges.sort((a, b) =>
        a.start.line !== b.start.line ? a.start.line - b.start.line : a.start.character - b.start.character
    );

    const combinedRanges: vscode.Range[] = [];
    let currentRange = sortedRanges[0];

    for (let i = 1; i < sortedRanges.length; i++) {
        const nextRange = sortedRanges[i];

        if (currentRange.end.line === nextRange.start.line &&
            (nextRange.start.character - currentRange.end.character <= n || currentRange.intersection(nextRange))) {
            // Combine ranges
            currentRange = new vscode.Range(
                currentRange.start,
                nextRange.end.character > currentRange.end.character ? nextRange.end : currentRange.end
            );
        } else {
            combinedRanges.push(currentRange);
            currentRange = nextRange;
        }
    }

    combinedRanges.push(currentRange);
    return combinedRanges;
}

export class AutoEditsRenderer implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private activeProposedChange: ProposedChange | null = null

    constructor() {
        this.disposables.push(
            vscode.commands.registerCommand(
                'cody.supersuggest.accept',
                () => this.acceptProposedChange(),
                this.disposables
            )
        )
        this.disposables.push(
            vscode.commands.registerCommand(
                'cody.supersuggest.dismiss',
                () => this.dismissProposedChange(),
                this.disposables
            )
        )
    }

    public async render(
        options: AutoEditsProviderOptions,
        codeToReplace: CodeToReplaceData,
        predictedText: string
    ) {
        const editor = vscode.window.activeTextEditor
        const document = editor?.document
        if (!editor || !document || this.activeProposedChange) {
            return
        }

        const prevSuffixLine = codeToReplace.endLine - 1
        const range = new vscode.Range(
            codeToReplace.startLine,
            0,
            prevSuffixLine,
            options.document.lineAt(prevSuffixLine).range.end.character
        )
        this.activeProposedChange = {
            range: range,
            newText: predictedText,
        }

        const currentFileText = options.document.getText()
        const predictedFileText =
            currentFileText.slice(0, document.offsetAt(range.start)) +
            predictedText +
            currentFileText.slice(document.offsetAt(range.end))
        this.logDiff(options.document.uri, currentFileText, predictedText, predictedFileText)

        const edits = diff(currentFileText, predictedFileText)
        const allRangesToRemove: vscode.Range[] = []
        for (const [from1, to1] of edits) {
            const startPos = document.positionAt(from1)
            const endPos = document.positionAt(to1)
            allRangesToRemove.push(new vscode.Range(startPos, endPos))
        }

        // Combine ranges with a threshold of 5 characters
        const combinedRangesToRemove = combineRanges(allRangesToRemove, 5);

        const filename = displayPath(document.uri)
        const patch = structuredPatch(
            `a/${filename}`,
            `b/${filename}`,
            currentFileText,
            predictedFileText
        )
        let isChanged = false

        // const removedRanges: vscode.Range[] = []
        const addedLines: DecorationLine[] = []

        for (const hunk of patch.hunks) {
            let oldLineNumber = hunk.oldStart
            let newLineNumber = hunk.newStart

            for (const line of hunk.lines) {
                if (line.length === 0) {
                    continue
                }
                if (line[0] === '-') {
                    isChanged = true
                    const lineText = document.lineAt(oldLineNumber - 1).text
                    const startChar = lineText.indexOf(line.slice(1))
                    if (startChar !== -1) {
                        // removedRanges.push(new vscode.Range(
                        //     oldLineNumber - 1,
                        //     startChar,
                        //     oldLineNumber - 1,
                        //     startChar + line.slice(1).length
                        // ))
                    }
                    oldLineNumber++
                } else if (line[0] === '+') {
                    isChanged = true
                    addedLines.push({ line: newLineNumber - 1, text: line.slice(1) })
                    newLineNumber++
                } else if (line[0] === ' ') {
                    oldLineNumber++
                    newLineNumber++
                }
            }
        }

        if (!isChanged) {
            await this.showNoChangeMessageAtCursor()
            return
        }

        editor.setDecorations(removedTextDecorationType, combinedRangesToRemove)
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
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
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
    }

    private async showNoChangeMessageAtCursor() {
        this.activeProposedChange = null
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }

        const position = editor.selection.active
        const lineLength = editor.document.lineAt(position.line).text.length
        const range = new vscode.Range(position.line, 0, position.line, lineLength)
        editor.setDecorations(suggesterType, [
            {
                range,
                renderOptions: {
                    after: {
                        contentText: 'Cody: no suggested changes',
                        color: GHOST_TEXT_COLOR,
                        fontStyle: 'italic',
                    },
                },
            },
        ])
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
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
