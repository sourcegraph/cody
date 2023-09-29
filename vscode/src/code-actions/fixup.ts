import * as vscode from 'vscode'

import { FixupIntent } from '@sourcegraph/cody-shared/src/chat/recipes/fixup'

export class FixupCodeAction implements vscode.CodeActionProvider {
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
        // Expand range to include the full line for better fixup quality.
        // TODO: Improve this
        const expandedRange = new vscode.Range(
            document.lineAt(range.start.line).range.start,
            document.lineAt(range.end.line).range.end
        )
        return [this.createCommandCodeAction(diagnostics, expandedRange)]
    }

    private createCommandCodeAction(diagnostics: vscode.Diagnostic[], range: vscode.Range): vscode.CodeAction {
        const action = new vscode.CodeAction('Ask Cody to Fix', vscode.CodeActionKind.QuickFix)
        const instruction = this.getCodeActionInstruction(diagnostics)
        const source = 'code-action'
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [{ instruction, range }, source],
            title: 'Ask Cody to Fix',
        }
        action.diagnostics = diagnostics
        return action
    }

    private getCodeActionInstruction = (diagnostics: vscode.Diagnostic[]): string => {
        const intent: FixupIntent = 'edit'
        return `/${intent} Fix the following error${diagnostics.length > 1 ? 's' : ''}:\n${diagnostics
            .map(({ message }) => `\`\`\`${message}\`\`\``)
            .join('\n')}`
    }
}
