import * as vscode from 'vscode'
import type { AutoEditInlineDecorations, AutoEditsDecorator, DecorationInfo } from './base'

export class InlineDiffDecorator implements vscode.Disposable, AutoEditsDecorator {
    private readonly addedTextDecorationType = vscode.window.createTextEditorDecorationType({})
    private readonly removedTextDecorationType = vscode.window.createTextEditorDecorationType({})

    constructor(private readonly editor: vscode.TextEditor) {}

    public setDecorations(decorationInfo: DecorationInfo): void {
        console.log('setting decorations!', decorationInfo)
    }

    public setDecorationsV2(decorations: AutoEditInlineDecorations[]): void {
        for (const decoration of decorations) {
            // TODO: We need to clear these...
            this.editor.setDecorations(decoration.type, decoration.options)
        }
    }

    public canRenderDecoration(decorationInfo: DecorationInfo): boolean {
        // Inline decorator can render any decoration, so it should always return true.
        return true
    }

    public dispose(): void {
        this.clearDecorations()
        this.addedTextDecorationType.dispose()
        this.removedTextDecorationType.dispose()
    }

    private clearDecorations(): void {
        this.editor.setDecorations(this.addedTextDecorationType, [])
        this.editor.setDecorations(this.removedTextDecorationType, [])
    }
}
