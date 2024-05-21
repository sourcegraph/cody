import * as vscode from 'vscode'

import { PromptString, ps } from '@sourcegraph/cody-shared'
import type { ExecuteEditArguments } from '../edit/execute'
import { getSmartSelection } from '../editor/utils'

const FIX_PROMPT_TOPICS = {
    SOURCE: ps`PROBLEMCODE4179`,
    RELATED: ps`RELATEDCODE50`, // Note: We append additional digits to this topic as a single problem code can have multiple related code.
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
        const targetAreaRange = await getSmartSelection(document.uri, range.start)

        const newRange = targetAreaRange
            ? new vscode.Range(targetAreaRange.start, targetAreaRange.end)
            : expandedRange
        const codeAction = await this.createCommandCodeAction(document, diagnostics, newRange)
        return [codeAction]
    }

    private async createCommandCodeAction(
        document: vscode.TextDocument,
        diagnostics: vscode.Diagnostic[],
        range: vscode.Range
    ): Promise<vscode.CodeAction> {
        const action = new vscode.CodeAction('Ask Cody to Fix', vscode.CodeActionKind.QuickFix)
        const instruction = await this.getCodeActionInstruction(
            document.uri,
            PromptString.fromDocumentText(document, range),
            diagnostics
        )
        const source = 'code-action:fix'
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [
                {
                    configuration: { instruction, range, intent: 'fix', document },
                    source,
                    telemetryMetadata: {
                        diagnostics: diagnostics.map(diagnostic => ({
                            code: getDiagnosticCode(diagnostic.code),
                            source: diagnostic.source,
                        })),
                    },
                } satisfies ExecuteEditArguments,
            ],
            title: 'Ask Cody to Fix',
        }
        action.diagnostics = diagnostics
        return action
    }

    // Public for testing
    public async getCodeActionInstruction(
        uri: vscode.Uri,
        code: PromptString,
        diagnostics: vscode.Diagnostic[]
    ): Promise<PromptString> {
        const prompt: PromptString[] = [
            ps`<${FIX_PROMPT_TOPICS.SOURCE}>${code}</${FIX_PROMPT_TOPICS.SOURCE}>\n`,
        ]

        for (let i = 0; i < diagnostics.length; i++) {
            const { severity, relatedInformation } = diagnostics[i]
            const diagnosticPrompt = PromptString.fromDiagnostic(uri, diagnostics[i])

            const diagnosticType =
                severity === vscode.DiagnosticSeverity.Warning ? ps`warning` : ps`error`
            prompt.push(
                ps`Fix the following ${
                    diagnosticPrompt.source ? ps`${diagnosticPrompt.source} ` : ''
                }${diagnosticType} from within <${FIX_PROMPT_TOPICS.SOURCE}></${
                    FIX_PROMPT_TOPICS.SOURCE
                }>: ${diagnosticPrompt.message}`
            )

            if (relatedInformation?.length && diagnosticPrompt.relatedInformation?.length) {
                prompt.push(ps`Code related to this diagnostic:`)
                const relatedInfo = await this.getRelatedInformationContext(
                    relatedInformation,
                    diagnosticPrompt.relatedInformation
                )
                prompt.push(...relatedInfo)
            }

            if (i < diagnostics.length - 1) {
                prompt.push(ps`\n`)
            }
        }

        return PromptString.join(prompt, ps`\n`)
    }

    private async getRelatedInformationContext(
        relatedInformation: vscode.DiagnosticRelatedInformation[],
        relatedInformationPrompt: {
            message: PromptString
        }[]
    ): Promise<PromptString[]> {
        const prompt: PromptString[] = []
        for (let i = 0; i < relatedInformation.length; i++) {
            const { location } = relatedInformation[i]
            const { message } = relatedInformationPrompt[i]
            prompt.push(message)
            const document = await vscode.workspace.openTextDocument(location.uri)
            prompt.push(
                ps`<${FIX_PROMPT_TOPICS.RELATED}${i}>${PromptString.fromDocumentText(
                    document,
                    location.range
                )}</${FIX_PROMPT_TOPICS.RELATED}${i}>\n`
            )
        }
        return prompt
    }
}

function getDiagnosticCode(diagnosticCode: vscode.Diagnostic['code']): string | undefined {
    if (!diagnosticCode) {
        return
    }

    const code = typeof diagnosticCode === 'object' ? diagnosticCode.value : diagnosticCode
    return code.toString()
}
