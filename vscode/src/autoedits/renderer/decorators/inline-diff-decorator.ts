import * as vscode from 'vscode'
import type { AutoEditDecorations, AutoEditsDecorator, DecorationInfo } from './base'

export class InlineDiffDecorator implements vscode.Disposable, AutoEditsDecorator {
    private readonly addedTextDecorationType = vscode.window.createTextEditorDecorationType({})
    private readonly removedTextDecorationType = vscode.window.createTextEditorDecorationType({})
    private readonly insertMarkerDecorationType = vscode.window.createTextEditorDecorationType({
        border: '1px dashed rgba(100, 255, 100, 0.5)',
        borderWidth: '1px 1px 0 0',
    })

    constructor(private readonly editor: vscode.TextEditor) {}

    setDecorations(_decorationInfo: DecorationInfo, decorations?: AutoEditDecorations): void {
        if (!decorations) {
            throw new Error('InlineDiffDecorator relies on pre-computed decorations')
        }
        this.editor.setDecorations(this.addedTextDecorationType, decorations.insertionDecorations)
        this.editor.setDecorations(this.removedTextDecorationType, decorations.deletionDecorations)
        this.editor.setDecorations(this.insertMarkerDecorationType, decorations.insertMarkerDecorations)
    }

    public dispose(): void {
        this.addedTextDecorationType.dispose()
        this.removedTextDecorationType.dispose()
        this.insertMarkerDecorationType.dispose()
    }
}
