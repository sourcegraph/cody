import * as vscode from 'vscode'

import { type ContextItem, ContextItemSource } from '@sourcegraph/cody-shared'
import type { ExecuteEditArguments } from '../edit/execute'
import { fetchDocumentSymbols } from '../edit/input/utils'
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
        const instruction = await this.getCodeActionInstruction(document.getText(range), diagnostics)
        const contextSymbols = await this.getRelatedSymbolContext(document, diagnostics)
        console.log('Context symbols', contextSymbols)
        const source = 'code-action:fix'
        action.command = {
            command: 'cody.command.edit-code',
            arguments: [
                {
                    configuration: {
                        instruction,
                        range,
                        intent: 'fix',
                        document,
                        userContextFiles: contextSymbols,
                    },
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
        code: string,
        diagnostics: vscode.Diagnostic[]
    ): Promise<string> {
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

    private async getRelatedSymbolContext(
        document: vscode.TextDocument,
        diagnostics: vscode.Diagnostic[]
    ): Promise<ContextItem[]> {
        const documentSymbols = await fetchDocumentSymbols(document)

        const messageContext: ContextItem[] = []
        const documentContext: ContextItem[] = []

        for (const diagnostic of diagnostics) {
            documentContext.push(
                ...(await getSymbolsFromRange(documentSymbols, document, diagnostic.range))
            )
            messageContext.push(
                ...(await getSymbolsFromDiagnosticMessage(diagnostic.message, document, documentSymbols))
            )
        }

        // TODO: Ensure message context takes precedence
        return [...messageContext, ...documentContext]
    }
}

const DIAGNOSTIC_SYMBOL_EXCLUSIONS = [
    'string',
    'number',
    'boolean',
    'true',
    'false',
    'null',
    'undefined',
    'type',
    'assignable',
    'not',
    'to',
    'is',
]

export function extractSymbolLikeInformationFromDiagnosticMessage(message: string) {
    const regex = /'\w+(\s*\|\s*\w+)*'/g
    const matches = message.match(regex)

    if (matches) {
        const symbols = matches.flatMap(match => {
            return match.replace(/'/g, '').split(/\s*\|\s*/)
        })

        return [...new Set(symbols)].filter(symbol => !DIAGNOSTIC_SYMBOL_EXCLUSIONS.includes(symbol))
    }

    return []
}

async function getSymbolsFromDiagnosticMessage(
    message: string,
    document: vscode.TextDocument,
    documentSymbols: vscode.DocumentSymbol[]
): Promise<ContextItem[]> {
    const extractedSymbols = extractSymbolLikeInformationFromDiagnosticMessage(message)

    console.log('Extracted symbols...', extractedSymbols)
    const symbols: ContextItem[] = []

    for (const symbol of extractedSymbols) {
        const symbolFromDocument = documentSymbols.find(docSymbol => docSymbol.name === symbol)
        if (symbolFromDocument) {
            symbols.push(getSymbolAsContextItem(document, symbolFromDocument))
            continue
        }

        const symbolFromWorkspace = (
            await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                'vscode.executeWorkspaceSymbolProvider',
                symbol
            )
        )?.filter(workspaceSymbol => workspaceSymbol.name === symbol)[0]
        if (symbolFromWorkspace) {
            symbols.push(getSymbolAsContextItem(document, symbolFromWorkspace))
        }
    }

    return symbols
}

async function getSymbolsFromRange(
    documentSymbols: vscode.DocumentSymbol[],
    document: vscode.TextDocument,
    range: vscode.Range
): Promise<ContextItem[]> {
    return documentSymbols
        .filter(symbol => range.contains(symbol.range))
        .map(symbol => getSymbolAsContextItem(document, symbol))
}

function getSymbolAsContextItem(
    document: vscode.TextDocument,
    symbol: vscode.DocumentSymbol | vscode.SymbolInformation
): ContextItem {
    if ('location' in symbol) {
        return {
            type: 'symbol',
            uri: symbol.location.uri,
            symbolName: symbol.name,
            range: symbol.location.range,
            kind: 'function', // todo fix symbolkind limits
            source: ContextItemSource.Editor,
        }
    }

    return {
        type: 'symbol',
        uri: document.uri,
        symbolName: symbol.name,
        range: symbol.range,
        kind: 'function', // todo fix symbolkind limits
        source: ContextItemSource.Editor,
    }
}

function getDiagnosticCode(diagnosticCode: vscode.Diagnostic['code']): string | undefined {
    if (!diagnosticCode) {
        return
    }

    const code = typeof diagnosticCode === 'object' ? diagnosticCode.value : diagnosticCode
    return code.toString()
}
