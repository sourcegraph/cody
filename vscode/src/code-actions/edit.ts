import * as vscode from 'vscode'

import { ExecuteEditArguments } from '../edit/execute'

export class EditCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.RefactorRewrite]

    public provideCodeActions(document: vscode.TextDocument): vscode.CodeAction[] {
        const editor = vscode.window.activeTextEditor

        if (!editor) {
            return []
        }

        if (editor.selection.isEmpty && !document.lineAt(editor.selection.start.line).isEmptyOrWhitespace) {
            // Empty selection but a non-empty line, show nothing as the user likely won't want to generate here.
            return []
        }

        if (editor.selection.isEmpty) {
            // Empty selection and empty line, show generate action
            return [this.createGenerateCodeAction(document, editor.selection)]
        }

        // Non-empty selection, show edit action
        return [this.createEditCommandCodeAction(document, editor.selection)]
    }

    private createGenerateCodeAction(document: vscode.TextDocument, selection: vscode.Selection): vscode.CodeAction {
        const displayText = 'Ask Cody to Generate'
        const source = 'code-action:generate'
        const action = new vscode.CodeAction(displayText, vscode.CodeActionKind.RefactorRewrite)
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [
                {
                    range: new vscode.Range(selection.start, selection.end),
                    intent: 'add',
                    document,
                    insertMode: true,
                } satisfies ExecuteEditArguments,
                source,
            ],
            title: displayText,
        }
        return action
    }

    private createEditCommandCodeAction(document: vscode.TextDocument, selection: vscode.Selection): vscode.CodeAction {
        const displayText = 'Ask Cody to Edit'
        const source = 'code-action:edit'
        const action = new vscode.CodeAction(displayText, vscode.CodeActionKind.RefactorRewrite)
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [
                {
                    range: new vscode.Range(selection.start, selection.end),
                    intent: 'edit',
                    document,
                } satisfies ExecuteEditArguments,
                source,
            ],
            title: displayText,
        }
        return action
    }
}
