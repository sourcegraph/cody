import * as vscode from 'vscode'

import type { ExecuteEditArguments } from '../edit/execute'
import { CodyCodeActionKind } from './kind'

export class EditCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        CodyCodeActionKind.RefactorRewrite.append('editCode.generate'),
        CodyCodeActionKind.RefactorRewrite.append('editCode.edit'),
    ] as const
    public static readonly documentSelector = '*'

    public provideCodeActions(document: vscode.TextDocument): vscode.CodeAction[] {
        const editor = vscode.window.activeTextEditor

        if (!editor) {
            return []
        }

        if (
            editor.selection.isEmpty &&
            !document.lineAt(editor.selection.start.line).isEmptyOrWhitespace
        ) {
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

    private createGenerateCodeAction(
        document: vscode.TextDocument,
        selection: vscode.Selection
    ): vscode.CodeAction {
        const displayText = 'Cody: Generate Code'
        const source = 'code-action:generate'
        const action = new vscode.CodeAction(displayText, EditCodeAction.providedCodeActionKinds[0])
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [
                {
                    configuration: {
                        range: new vscode.Range(selection.start, selection.end),
                        intent: 'add',
                        document,
                        mode: 'insert',
                    },
                    source,
                } satisfies ExecuteEditArguments,
            ],
            title: displayText,
        }
        return action
    }

    private createEditCommandCodeAction(
        document: vscode.TextDocument,
        selection: vscode.Selection
    ): vscode.CodeAction {
        const displayText = 'Cody: Edit Code'
        const source = 'code-action:edit'
        const action = new vscode.CodeAction(displayText, EditCodeAction.providedCodeActionKinds[1])
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [
                {
                    configuration: {
                        range: new vscode.Range(selection.start, selection.end),
                        intent: 'edit',
                        document,
                    },
                    source,
                } satisfies ExecuteEditArguments,
            ],
            title: displayText,
        }
        return action
    }
}
