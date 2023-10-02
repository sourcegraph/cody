import * as vscode from 'vscode'

export class ExplainCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]
    private command: string

    constructor(inline: boolean) {
        this.command = inline ? 'cody.inline.add' : 'cody.action.chat'
    }

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
        return [this.createCommandCodeAction(diagnostics, range)]
    }

    private createCommandCodeAction(diagnostics: vscode.Diagnostic[], range: vscode.Range): vscode.CodeAction {
        const action = new vscode.CodeAction('Ask Cody to Explain', vscode.CodeActionKind.QuickFix)
        const instruction = this.getCodeActionInstruction(diagnostics)
        action.command = {
            command: this.command,
            arguments: [instruction, range],
            title: 'Ask Cody to Explain',
        }
        action.diagnostics = diagnostics
        return action
    }

    private getCodeActionInstruction = (diagnostics: vscode.Diagnostic[]): string =>
        `Explain the following error${diagnostics.length > 1 ? 's' : ''}:\n${diagnostics
            .map(({ message }) => `\`\`\`${message}\`\`\``)
            .join('\n')}`
}
