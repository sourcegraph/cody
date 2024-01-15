import * as vscode from 'vscode'

import { type ExecuteEditArguments } from '../edit/execute'
import { getSmartSelection } from '../editor/utils'

const FIX_PROMPT_TOPICS = {
    SOURCE: 'PROBLEMCODE4179',
    RELATED: 'RELATEDCODE50', // Note: We append additional digits to this topic as a single problem code can have multiple related code.
}

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
        const codeAction = await this.createCommandCodeAction(document, diagnostics, newRange)
        return [codeAction]
    }

    private async createCommandCodeAction(
        document: vscode.TextDocument,
        diagnostics: vscode.Diagnostic[],
        range: vscode.Range
    ): Promise<vscode.CodeAction> {
        const action = new vscode.CodeAction('Ask Cody to Fix', vscode.CodeActionKind.QuickFix)
        const instruction = await this.getCodeActionInstruction(document.getText(range), diagnostics)
        const source = 'code-action:fix'
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [{ instruction, range, intent: 'fix', document } satisfies ExecuteEditArguments, source],
            title: 'Ask Cody to Fix',
        }
        action.diagnostics = diagnostics
        return action
    }

    // Public for testing
    public async getCodeActionInstruction(code: string, diagnostics: vscode.Diagnostic[]): Promise<string> {
        const prompt: string[] = [`<${FIX_PROMPT_TOPICS.SOURCE}>${code}</${FIX_PROMPT_TOPICS.SOURCE}>\n`]

        for (let i = 0; i < diagnostics.length; i++) {
            const { message, source, severity, relatedInformation } = diagnostics[i]

            const diagnosticType = severity === vscode.DiagnosticSeverity.Warning ? 'warning' : 'error'
            prompt.push(
                `Fix the following ${source ? `${source} ` : ''}${diagnosticType} from within <${
                    FIX_PROMPT_TOPICS.SOURCE
                }></${FIX_PROMPT_TOPICS.SOURCE}>: ${message}`
            )

            if (relatedInformation?.length) {
                prompt.push('Code related to this diagnostic:')
                const relatedInfo = await this.getRelatedInformationContext(relatedInformation)
                prompt.push(...relatedInfo)
            }

            if (i < diagnostics.length - 1) {
                prompt.push('\n')
            }
        }

        return prompt.join('\n')
    }

    private async getRelatedInformationContext(
        relatedInformation: vscode.DiagnosticRelatedInformation[]
    ): Promise<string[]> {
        const prompt: string[] = []
        for (let i = 0; i < relatedInformation.length; i++) {
            const { location, message } = relatedInformation[i]
            prompt.push(message)
            const document = await vscode.workspace.openTextDocument(location.uri)
            prompt.push(
                `<${FIX_PROMPT_TOPICS.RELATED}${i}>${document.getText(location.range)}</${
                    FIX_PROMPT_TOPICS.RELATED
                }${i}>\n`
            )
        }
        return prompt
    }
}
