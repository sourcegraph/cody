import * as vscode from 'vscode'
import type { AutoEditDecorations, AutoEditsDecorator } from './base'

export class InlineDiffDecorator implements vscode.Disposable, AutoEditsDecorator {
    private readonly addedTextDecorationType = vscode.window.createTextEditorDecorationType({})
    private readonly removedTextDecorationType = vscode.window.createTextEditorDecorationType({})
    private readonly insertMarkerDecorationType = vscode.window.createTextEditorDecorationType({
        border: '1px dashed rgba(100, 255, 100, 0.5)',
        borderWidth: '1px 1px 0 0',
    })

    public setDecorations(uri: vscode.Uri, decorations: AutoEditDecorations): void {
        const editor = this.getEditorForUri(uri)
        if (!editor) {
            return
        }

        editor.setDecorations(this.addedTextDecorationType, decorations.insertionDecorations)
        editor.setDecorations(this.removedTextDecorationType, decorations.deletionDecorations)
        editor.setDecorations(this.insertMarkerDecorationType, decorations.insertMarkerDecorations)
    }

    public hideDecorations(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this.addedTextDecorationType, [])
            editor.setDecorations(this.removedTextDecorationType, [])
            editor.setDecorations(this.insertMarkerDecorationType, [])
        }
    }

    private getEditorForUri(uri: vscode.Uri): vscode.TextEditor | undefined {
        return vscode.window.visibleTextEditors.find(
            editor => editor.document.uri.toString() === uri.toString()
        )
    }

    public dispose(): void {
        this.addedTextDecorationType.dispose()
        this.removedTextDecorationType.dispose()
        this.insertMarkerDecorationType.dispose()
    }
}
