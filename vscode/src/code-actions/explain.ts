import { PromptString, ps } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { ExecuteChatArguments } from '../commands/execute/ask'

export class ExplainCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]

    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const diagnostics = context.diagnostics.filter(
            diagnostic =>
                diagnostic.severity === vscode.DiagnosticSeverity.Error ||
                diagnostic.severity === vscode.DiagnosticSeverity.Warning
        )
        if (diagnostics.length === 0) {
            return []
        }
        return [this.createCommandCodeAction(document.uri, diagnostics)]
    }

    private createCommandCodeAction(
        uri: vscode.Uri,
        diagnostics: vscode.Diagnostic[]
    ): vscode.CodeAction {
        const action = new vscode.CodeAction('Ask Cody to Explain', vscode.CodeActionKind.QuickFix)
        const instruction = this.getCodeActionInstruction(uri, diagnostics)
        action.command = {
            command: 'cody.action.chat',
            arguments: [
                {
                    text: instruction,
                    source: 'code-action:explain',
                    submitType: 'user-newchat',
                } satisfies ExecuteChatArguments,
            ],
            title: 'Ask Cody to Explain',
        }
        action.diagnostics = diagnostics
        return action
    }

    private getCodeActionInstruction = (uri: vscode.Uri, diagnostics: vscode.Diagnostic[]) =>
        ps`Explain the following error${diagnostics.length > 1 ? ps`s` : ''}:\n\n${PromptString.join(
            diagnostics
                .map(d => PromptString.fromDiagnostic(uri, d))
                .map(({ message }) => ps`\`\`\`${message}\`\`\``),
            ps`\n\n`
        )}`
}
