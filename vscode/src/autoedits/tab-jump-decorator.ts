import * as vscode from 'vscode'

class TabJumpDecorator {
    private readonly decorationType: vscode.TextEditorDecorationType
    private activeDecorations: vscode.DecorationOptions[] = []
    private readonly disposables: vscode.Disposable[] = []

    constructor() {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: 'Tab to Jump',
                color: '#3794ff',
                margin: '0 0 0 1em',
                fontStyle: 'normal',
            }
        })

        // Listen for key presses
        this.disposables.push(
            vscode.commands.registerCommand('type', args => this.handleKeyPress(args)),
            vscode.workspace.onDidChangeTextDocument(event => this.clearDecorations()),
            vscode.window.onDidChangeTextEditorSelection(() => this.clearDecorations()),
            vscode.window.onDidChangeActiveTextEditor(() => this.clearDecorations()),
            vscode.workspace.onDidCloseTextDocument(() => this.clearDecorations())
        )
    }

    public isActiveDecoration(): boolean {
        return this.activeDecorations.length > 0
    }

    private handleKeyPress(args: { text?: string }): void {
        if (args.text === '\t') {
            console.log('User pressed tab!')
        }
        this.clearDecorations()
    }

    public showTabJumpHint(editor: vscode.TextEditor, line: number): void {
        const range = new vscode.Range(
            new vscode.Position(line, editor.document.lineAt(line).text.length),
            new vscode.Position(line, editor.document.lineAt(line).text.length)
        )

        this.activeDecorations = [{
            range,
            hoverMessage: 'Press Tab to jump to the next section'
        }]

        editor.setDecorations(this.decorationType, this.activeDecorations)
    }

    public clearDecorations(): void {
        // Clear all active decorations
        if (vscode.window.activeTextEditor) {
            vscode.window.activeTextEditor.setDecorations(this.decorationType, [])
        }
        this.activeDecorations = []
    }

    public dispose(): void {
        this.decorationType.dispose()
        this.disposables.forEach(d => d.dispose())
    }
}

export const tabJumpDecorator = new TabJumpDecorator()

