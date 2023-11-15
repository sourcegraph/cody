import * as vscode from 'vscode'

export class EditCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.RefactorRewrite]

    public provideCodeActions(document: vscode.TextDocument): vscode.CodeAction[] {
        const selection = vscode.window.activeTextEditor?.selection
        if (!selection || selection.isEmpty) {
            return [this.createCommandCodeAction(document, 'Ask Cody to Generate')]
        }

        return [this.createCommandCodeAction(document, 'Ask Cody to Edit', selection)]
    }

    private createCommandCodeAction(
        document: vscode.TextDocument,
        displayText: string,
        selection?: vscode.Selection
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(displayText, vscode.CodeActionKind.RefactorRewrite)
        const source = 'code-action'
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [
                {
                    range: selection ? new vscode.Range(selection.start, selection.end) : undefined,
                    intent: 'edit',
                    document,
                },
                source,
            ],
            title: displayText,
        }
        return action
    }
}
