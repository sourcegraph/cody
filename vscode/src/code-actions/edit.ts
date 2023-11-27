import * as vscode from 'vscode'

import { FixupIntent } from '@sourcegraph/cody-shared/src/editor'

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
            return [this.createCommandCodeAction(document, 'Ask Cody to Generate')]
        }

        // Non-empty selection, show edit action
        return [this.createCommandCodeAction(document, 'Ask Cody to Edit', editor.selection)]
    }

    private createCommandCodeAction(
        document: vscode.TextDocument,
        displayText: string,
        selection?: vscode.Selection
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(displayText, vscode.CodeActionKind.RefactorRewrite)
        const source = 'code-action:edit'
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [
                {
                    range: selection ? new vscode.Range(selection.start, selection.end) : undefined,
                    intent: 'edit' satisfies FixupIntent,
                    document,
                },
                source,
            ],
            title: displayText,
        }
        return action
    }
}
