import * as vscode from 'vscode'

import { FixupIntent } from '@sourcegraph/cody-shared/src/chat/recipes/fixup'

import { getSmartSelection } from '../editor/utils'

export class FixupCodeAction implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]

    public async provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext
    ): Promise<vscode.CodeAction[]> {
        const diagnostics = context.diagnostics.filter(
            diagnostic =>
                diagnostic.severity === vscode.DiagnosticSeverity.Error ||
                diagnostic.severity === vscode.DiagnosticSeverity.Warning
        )
        if (diagnostics.length === 0) {
            return []
        }

        // Expand range to include the full line for better fixup quality
        const expandedRange = new vscode.Range(
            document.lineAt(range.start.line).range.start,
            document.lineAt(range.end.line).range.end
        )

        // TODO bee check if the diagnostics are related to imports and include import ranges instead of error lines
        // const importDiagnostics = diagnostics.filter(diagnostic => diagnostic.message.includes('import'))

        // Expand range by getting the folding range contains the target (error) area
        const targetAreaRange = await getSmartSelection(document.uri, range.start.line)

        const newRange = targetAreaRange ? new vscode.Range(targetAreaRange.start, targetAreaRange.end) : expandedRange
        return [this.createCommandCodeAction(diagnostics, newRange)]
    }

    private createCommandCodeAction(diagnostics: vscode.Diagnostic[], range: vscode.Range): vscode.CodeAction {
        const action = new vscode.CodeAction('Ask Cody to Fix', vscode.CodeActionKind.QuickFix)
        const instruction = this.getCodeActionInstruction(diagnostics)
        const source = 'code-action'
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [{ instruction, range, intent: 'fix' satisfies FixupIntent }, source],
            title: 'Ask Cody to Fix',
        }
        action.diagnostics = diagnostics
        return action
    }

    private getCodeActionInstruction = (diagnostics: vscode.Diagnostic[]): string => {
        return `Fix the following error${diagnostics.length > 1 ? 's' : ''}: ${diagnostics
            .map(({ message }) => `\`\`\`${message}\`\`\``)
            .join('\n')}`
    }
}
