import * as vscode from 'vscode'

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
        return [this.createCommandCodeAction(diagnostics)]
    }

    private createCommandCodeAction(diagnostics: vscode.Diagnostic[]): vscode.CodeAction {
        const action = new vscode.CodeAction('Ask Cody to Explain', vscode.CodeActionKind.QuickFix)
        const instruction = this.getCodeActionInstruction(diagnostics)
        action.command = {
            command: 'cody.action.chat',
            arguments: [instruction, 'code-action:explain'],
            title: 'Ask Cody to Explain',
        }
        action.diagnostics = diagnostics
        return action
    }

    private getCodeActionInstruction = (diagnostics: vscode.Diagnostic[]): string =>
        `Explain the following error${diagnostics.length > 1 ? 's' : ''}:\n\n${diagnostics
            .map(({ message }) => `\`\`\`${message}\`\`\``)
            .join('\n\n')}`
}
