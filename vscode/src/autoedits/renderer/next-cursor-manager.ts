import * as vscode from 'vscode'

/**
 * Manages next cursor suggestions.
 * Displays decorations and handles accepting the suggestion.
 */
export class NextCursorManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private activeCursorSuggestion: { uri: vscode.Uri; position: vscode.Position } | null = null
    private readonly nextCursorDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        after: { contentText: 'tab - Jump to Edit' },
    })

    constructor() {
        this.disposables.push(
            vscode.commands.registerCommand(
                'cody.nextCursor.suggest',
                (uri: vscode.Uri, position: vscode.Position) =>
                    this.showNextCursorSuggestion(uri, position)
            ),
            vscode.commands.registerCommand('cody.nextCursor.accept', () =>
                this.acceptNextCursorSuggestion()
            ),
            vscode.workspace.onDidChangeTextDocument(event => this.hideNextCursorSuggestion()),
            vscode.window.onDidChangeActiveTextEditor(activeEditor => {
                if (!this.activeCursorSuggestion || !activeEditor) {
                    return
                }

                if (
                    this.activeCursorSuggestion.uri.toString() !== activeEditor.document.uri.toString()
                ) {
                    this.hideNextCursorSuggestion()
                }
            }),
            vscode.workspace.onDidCloseTextDocument(closedDocument => {
                if (!this.activeCursorSuggestion) {
                    return
                }

                if (this.activeCursorSuggestion.uri.toString() === closedDocument.uri.toString()) {
                    this.hideNextCursorSuggestion()
                }
            })
        )
    }

    public suggest(uri: vscode.Uri, position: vscode.Position): void {
        // Proxy through to the VS Code command so this can be easily adopted for Agent.
        vscode.commands.executeCommand('cody.nextCursor.suggest', uri, position)
    }

    public accept(): void {
        // Proxy through to the VS Code command so this can be easily adopted for Agent.
        vscode.commands.executeCommand('cody.nextCursor.accept')
    }

    private showNextCursorSuggestion(uri: vscode.Uri, position: vscode.Position): void {
        const editor = this.getEditorForUri(uri)
        if (!editor) {
            return
        }

        this.activeCursorSuggestion = { uri, position }
        // We set VS Code state so we can override the Tab command to execute `cody.nextCursor.accept` instead.
        void vscode.commands.executeCommand('setContext', 'cody.nextCursorSuggested', true)
        editor.setDecorations(this.nextCursorDecoration, [
            { range: new vscode.Range(position.line, 0, position.line, 0) },
        ])
    }

    private acceptNextCursorSuggestion(): void {
        if (!this.activeCursorSuggestion) {
            return
        }

        const editor = this.getEditorForUri(this.activeCursorSuggestion.uri)
        if (!editor) {
            return
        }

        editor.selection = new vscode.Selection(
            this.activeCursorSuggestion.position,
            this.activeCursorSuggestion.position
        )
        this.hideNextCursorSuggestion()
    }

    private hideNextCursorSuggestion(): void {
        if (!this.activeCursorSuggestion) {
            return
        }

        const editor = this.getEditorForUri(this.activeCursorSuggestion.uri)
        if (!editor) {
            return
        }

        this.activeCursorSuggestion = null
        // Reset VS Code state so the Tab command will be used for accepting any auto-edit suggestions
        void vscode.commands.executeCommand('setContext', 'cody.nextCursorSuggested', false)
        editor.setDecorations(this.nextCursorDecoration, [])
    }

    private getEditorForUri(uri: vscode.Uri): vscode.TextEditor | undefined {
        return vscode.window.visibleTextEditors.find(
            editor => editor.document.uri.toString() === uri.toString()
        )
    }

    public dispose(): void {
        this.nextCursorDecoration.dispose()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
