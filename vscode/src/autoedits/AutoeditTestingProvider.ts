import { diff } from 'fast-myers-diff'
import * as vscode from 'vscode'
import { INSERTED_CODE_DECORATION, REMOVED_CODE_DECORATION } from '../non-stop/decorations/constants'

export class AutoeditTestingProvider implements vscode.Disposable {
    disposables: vscode.Disposable[] = []
    outputChannel: vscode.OutputChannel
    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Autoedit Testing')
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(e => {
                try {
                    this.onChange(e.textEditor)
                } catch (error) {
                    if (error instanceof Error) {
                        this.outputChannel.appendLine(
                            JSON.stringify({
                                message: error.message,
                                stack: error.stack,
                            })
                        )
                    } else {
                        this.outputChannel.appendLine(String(error))
                    }
                }
            })
        )
    }

    private onChange(editor: vscode.TextEditor): void {
        if (!editor.document.uri.toString().includes('-autoedit')) {
            return
        }
        const split = this.findSplitMarker(editor.document)
        if (!split) {
            return
        }
        const before = new vscode.Range(0, 0, split.start.line, 0)
        const after = new vscode.Range(split.end.line + 1, 0, editor.document.lineCount, 0)
        // this.outputChannel.appendLine(JSON.stringify({ before, after }, null, 2))
        this.setDecorations(editor, before, after)
    }

    private findText(document: vscode.TextDocument, range: vscode.Range): string {
        const out: string[] = []
        for (let i = range.start.line; i < range.end.line; i++) {
            const line = document.lineAt(i).text
            if (line.includes('autoedit:skip')) {
                continue
            }
            out.push(line)
        }
        return out.join('\n')
    }

    private setDecorations(editor: vscode.TextEditor, before: vscode.Range, after: vscode.Range) {
        const document = editor.document
        const beforeText = this.findText(document, before)
        const beforeLines = beforeText.split('\n')
        const afterText = this.findText(document, after)
        const afterLines = afterText.split('\n')
        const insertedRanges: vscode.Range[] = []
        const deletedRanges: vscode.Range[] = []
        for (const [x1, x2, y1, y2] of diff(beforeLines, afterLines)) {
            for (let i = x1; i < x2; i++) {
                const line = before.start.line + 1
                const lineLength = document.lineAt(line).text.length
                this.outputChannel.appendLine('delete: ' + line)
                deletedRanges.push(new vscode.Range(line, 0, line, lineLength))
            }
            for (let i = y1; i < y2; i++) {
                const line = before.start.line + 1
                const lineLength = document.lineAt(line).text.length
                this.outputChannel.appendLine('add: ' + line)
                insertedRanges.push(new vscode.Range(line, 0, line, lineLength))
            }
        }
        editor.setDecorations(INSERTED_CODE_DECORATION, insertedRanges)
        editor.setDecorations(REMOVED_CODE_DECORATION, deletedRanges)
        // const beforeDecorations = this.computeDecoration(document, before)
        // const afterDecorations = this.computeDecoration(document, after)
        // return [...beforeDecorations, ...afterDecorations]
    }

    public dispose() {
        vscode.Disposable.from(...this.disposables).dispose()
    }

    private findSplitMarker(document: vscode.TextDocument): vscode.Range | undefined {
        const splits = this.findMarker(document, 'autoedit:split')
        if (splits.length === 0) {
            this.outputChannel.appendLine('Missing autoedit:split marker')
            return undefined
        }
        if (splits.length > 1) {
            this.outputChannel.appendLine('Too many autoedit:split markers')
            return undefined
        }
        return splits.at(0)
    }

    private findMarker(document: vscode.TextDocument, marker: string): vscode.Range[] {
        const results: vscode.Range[] = []
        const text = document.getText()
        let index = text.indexOf(marker)
        while (index !== -1) {
            const start = document.positionAt(index)
            const end = document.positionAt(index + marker.length)
            const range = new vscode.Range(start, end)
            results.push(range)
            index = text.indexOf(marker, index + marker.length)
        }
        return results
    }
}
