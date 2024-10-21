import { diff } from 'fast-myers-diff'
import * as vscode from 'vscode'
import { GHOST_TEXT_COLOR } from '../commands/GhostHintDecorator'
const RANGE_BEHAVIOUR = vscode.DecorationRangeBehavior.ClosedClosed

const STRIKETHROUGH_DECORATION_TYPE = vscode.window.createTextEditorDecorationType({
    textDecoration: 'line-through',
})

const GHOSTTEXT_DECORATION_TYPE = vscode.window.createTextEditorDecorationType({
    before: { color: GHOST_TEXT_COLOR },
    after: { color: GHOST_TEXT_COLOR },
})
const CURRENT_LINE_DECORATION = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('editor.wordHighlightTextBackground'),
    borderColor: new vscode.ThemeColor('editor.wordHighlightTextBorder'),
    rangeBehavior: RANGE_BEHAVIOUR,
})

const INSERTED_CODE_DECORATION = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
    isWholeLine: true,
    rangeBehavior: RANGE_BEHAVIOUR,
})

const REMOVED_CODE_DECORATION = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
    isWholeLine: true,
    rangeBehavior: RANGE_BEHAVIOUR,
})

const allDecorations = [
    REMOVED_CODE_DECORATION,
    INSERTED_CODE_DECORATION,
    CURRENT_LINE_DECORATION,
    GHOSTTEXT_DECORATION_TYPE,
    STRIKETHROUGH_DECORATION_TYPE,
]

export class AutoeditTestingProvider implements vscode.Disposable {
    documents = new Map<string, DiffDecorationManager>()
    disposables: vscode.Disposable[] = []
    outputChannel: vscode.OutputChannel
    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Autoedit Testing')
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(e => {
                const uri = e.textEditor.document.uri.toString()
                let manager = this.documents.get(uri)
                if (!manager) {
                    manager = new DiffDecorationManager(this.outputChannel, e.textEditor)
                    this.disposables.push(manager)
                    this.documents.set(uri, manager)
                }
                try {
                    manager.onChange()
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
    public dispose() {
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
class DiffDecorationManager implements vscode.Disposable {
    constructor(
        private readonly outputChannel: vscode.OutputChannel,
        private readonly editor: vscode.TextEditor
    ) {}

    public dispose() {
        this.clearDecorations()
    }

    private clearDecorations(): void {
        for (const decorationType of allDecorations) {
            this.editor.setDecorations(decorationType, [])
        }
    }
    public onChange(): void {
        if (!this.editor.document.uri.toString().includes('-autoedit')) {
            return
        }
        if (this.editor.document.getText().includes('autoedit:pause')) {
            this.clearDecorations()
            return
        }
        const split = this.findSplitMarker(this.editor.document)
        if (!split) {
            return
        }
        const before = new vscode.Range(0, 0, split.start.line, 0)
        const after = new vscode.Range(split.end.line + 1, 0, this.editor.document.lineCount, 0)
        // this.outputChannel.appendLine(JSON.stringify({ before, after }, null, 2))
        this.setDecorations(before, after)
    }

    private findText(range: vscode.Range): string {
        const out: string[] = []
        for (let i = range.start.line; i < range.end.line; i++) {
            const line = this.editor.document.lineAt(i).text
            if (line.includes('autoedit:skip')) {
                out.push('')
            } else {
                out.push(line)
            }
        }
        return out.join('\n')
    }

    private setDecorations(before: vscode.Range, after: vscode.Range) {
        const document = this.editor.document
        const beforeText = this.findText(before)
        const beforeLines = beforeText.split('\n')
        const afterText = this.findText(after)
        const afterLines = afterText.split('\n')
        const strikethroughRanges: vscode.Range[] = []
        const ghosttextRanges: vscode.DecorationOptions[] = []
        const modifiedRanges: vscode.Range[] = []
        const insertedRanges: vscode.Range[] = []
        const deletedRanges: vscode.Range[] = []
        this.outputChannel.appendLine(JSON.stringify({ beforeLines, afterLines }, null, 2))
        for (const [x1, x2, y1, y2] of diff(beforeLines, afterLines)) {
            this.outputChannel.appendLine('diff: ' + x1 + ' ' + x2 + ' ' + y1 + ' ' + y2)
            let i = 0
            while (x1 + i < x2 && y1 + i < y2) {
                const j = x1 + i
                const line = before.start.line + j
                const lineLength = document.lineAt(line).text.length
                const range = new vscode.Range(line, 0, line, lineLength)
                this.outputChannel.appendLine(
                    'modified: ' +
                        JSON.stringify(
                            {
                                a: beforeLines[j],
                                b: afterLines[j],
                            },
                            null,
                            2
                        )
                )
                for (const [a1, a2, b1, b2] of diff(beforeLines[j], afterLines[j])) {
                    strikethroughRanges.push(new vscode.Range(line, a1, line, a2))
                    ghosttextRanges.push({
                        range: new vscode.Range(line, b1, line, b2),
                        renderOptions: {
                            before: {
                                contentText: afterLines[j].slice(b1, b2),
                            },
                        },
                    })
                    this.outputChannel.appendLine(
                        'character-hunk: ' + a1 + ' ' + a2 + ' ' + b1 + ' ' + b2
                    )
                }
                modifiedRanges.push(range)
                i++
            }
            this.outputChannel.appendLine('modified: ' + i)
            for (let j = x1 + i; j < x2; j++) {
                const line = before.start.line + j
                const lineLength = document.lineAt(line).text.length
                const range = new vscode.Range(line, 0, line, lineLength)
                this.outputChannel.appendLine('delete: ' + document.getText(range))
                deletedRanges.push(range)
            }
            for (let j = y1 + i; j < y2; j++) {
                const line = before.start.line + j
                const lineLength = document.lineAt(line).text.length
                const range = new vscode.Range(line, 0, line, lineLength)
                this.outputChannel.appendLine('insert: ' + document.getText(range))
                insertedRanges.push(range)
            }
        }
        this.editor.setDecorations(CURRENT_LINE_DECORATION, modifiedRanges)
        this.editor.setDecorations(INSERTED_CODE_DECORATION, insertedRanges)
        this.editor.setDecorations(REMOVED_CODE_DECORATION, deletedRanges)
        this.editor.setDecorations(STRIKETHROUGH_DECORATION_TYPE, strikethroughRanges)
        this.editor.setDecorations(GHOSTTEXT_DECORATION_TYPE, ghosttextRanges)
        // const beforeDecorations = this.computeDecoration(document, before)
        // const afterDecorations = this.computeDecoration(document, after)
        // return [...beforeDecorations, ...afterDecorations]
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
