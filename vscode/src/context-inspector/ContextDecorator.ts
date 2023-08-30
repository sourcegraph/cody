import * as vscode from 'vscode'

export interface ContextDecoration {
    text: string
}

export class ContextDecorator implements vscode.Disposable {
    private decorationUsedContext: vscode.TextEditorDecorationType
    private decorations: Map<vscode.Uri, ContextDecoration[]> = new Map()

    constructor() {
        // TODO: Use ThemeColor here and make this configurable
        this.decorationUsedContext = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.Color(0, 0.8, 0.2, 0.5),
            isWholeLine: true,
        })
    }

    public void setDecorations(decorations: Map<vscode.Uri, ContextDecoration[]>) {
        // TODO: defensive copy
        this.decorations = decorations
    }

    public void dispose() {
        this.decorationUsedContext.dispose()
    }
}
