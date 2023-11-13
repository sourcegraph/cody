import * as vscode from 'vscode'

export class EditCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.RefactorRewrite]

    public provideCodeActions(document: vscode.TextDocument): vscode.CodeAction[] {
        const selection = vscode.window.activeTextEditor?.selection
        if (!selection || selection.isEmpty) {
            // Do nothing
            return []
        }

        return [this.createCommandCodeAction(document, selection)]
    }

    private createCommandCodeAction(document: vscode.TextDocument, selection: vscode.Selection): vscode.CodeAction {
        const action = new vscode.CodeAction('Ask Cody to Edit', vscode.CodeActionKind.RefactorRewrite)
        const source = 'code-action'
        const range = new vscode.Range(selection.start, selection.end)
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [{ range, intent: 'edit', document }, source],
            title: 'Ask Cody to Edit',
        }
        return action
    }
}
