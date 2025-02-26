import * as vscode from 'vscode'
import type { AutoEditDecorations, AutoEditsDecorator } from './base'

export class InlineDiffDecorator implements vscode.Disposable, AutoEditsDecorator {
    private readonly addedTextDecorationType = vscode.window.createTextEditorDecorationType({})
    private readonly removedTextDecorationType = vscode.window.createTextEditorDecorationType({})
    private readonly insertMarkerDecorationType = vscode.window.createTextEditorDecorationType({
        border: '1px dashed rgba(100, 255, 100, 0.5)',
        borderWidth: '1px 1px 0 0',
    })

    public showDecorations(editor: vscode.TextEditor, decorations: AutoEditDecorations): void {
        editor.setDecorations(this.addedTextDecorationType, decorations.insertionDecorations)
        editor.setDecorations(this.removedTextDecorationType, decorations.deletionDecorations)
        editor.setDecorations(this.insertMarkerDecorationType, decorations.insertMarkerDecorations)
    }

    public hideDecorations(editor: vscode.TextEditor): void {
        editor.setDecorations(this.addedTextDecorationType, [])
        editor.setDecorations(this.removedTextDecorationType, [])
        editor.setDecorations(this.insertMarkerDecorationType, [])
    }

    public dispose(): void {
        this.addedTextDecorationType.dispose()
        this.removedTextDecorationType.dispose()
        this.insertMarkerDecorationType.dispose()
    }
}
