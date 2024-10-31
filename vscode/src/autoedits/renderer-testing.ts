import * as vscode from 'vscode'
import { autoeditsLogger } from './logger'
import { AutoEditsRenderer } from './renderer'

export class AutoeditTestingProvider implements vscode.Disposable {
    private documents = new Map<string, DiffDecorationManager>()
    private disposables: vscode.Disposable[] = []

    constructor() {
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(async e => this.onChange(e.textEditor))
        )
    }

    private async onChange(editor: vscode.TextEditor): Promise<void> {
        const uri = editor.document.uri.toString()
        let manager = this.documents.get(uri)
        if (!manager) {
            manager = new DiffDecorationManager(editor)
            this.documents.set(uri, manager)
        }
        await manager.onChange()
    }

    public dispose(): void {
        for (const manager of this.documents.values()) {
            manager.dispose()
        }
        vscode.Disposable.from(...this.disposables).dispose()
    }
}

class DiffDecorationManager implements vscode.Disposable {
    private renderer: AutoEditsRenderer

    constructor(public readonly editor: vscode.TextEditor) {
        this.renderer = new AutoEditsRenderer(editor)
    }

    public async onChange(): Promise<void> {
        if (!this.editor.document.uri.toString().includes('-autoedit')) {
            return
        }
        this.renderer.clearDecorations()
        if (this.editor.document.getText().includes('autoedit:pause')) {
            return
        }
        const split = this.findSplitMarker(this.editor.document)
        if (!split) {
            return
        }
        const before = this.editor.document.getText(new vscode.Range(0, 0, split.start.line, 0))
        const marker = this.editor.document.getText(
            new vscode.Range(split.start.line, 0, split.end.line + 1, 0)
        )
        const after = this.editor.document.getText(
            new vscode.Range(split.end.line + 1, 0, this.editor.document.lineCount, 0)
        )

        const currentFileText = before + marker + after
        const predictedFileText = after + '\n' + marker + after

        await this.renderer.renderDecorations({
            document: this.editor.document,
            currentFileText,
            predictedFileText,
        })
    }

    private findSplitMarker(document: vscode.TextDocument): vscode.Range | undefined {
        const splits = this.findMarker(document, 'autoedit:split')
        if (splits.length === 0) {
            autoeditsLogger.logDebug('AutoEdits Testing', 'Missing autoedit:split marker')
            return undefined
        }
        if (splits.length > 1) {
            autoeditsLogger.logDebug('AutoEdits Testing', 'Too many autoedit:split markers')
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

    public dispose() {
        this.renderer.dispose()
    }
}
