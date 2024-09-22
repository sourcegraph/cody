import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import { XMLBuilder } from 'fast-xml-parser'
import * as vscode from 'vscode'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { RetrieverIdentifier } from '../../utils'

const xmlBuilder = new XMLBuilder({ format: true })

interface DiagnosticInformation {
    severity: string
    message: string
    source?: string
    text: string
    startLine: number
    endLine: number
    relatedInformation?: vscode.DiagnosticRelatedInformation[]
}

export class DiagnosticsRetriever implements vscode.Disposable, ContextRetriever {
    public identifier = RetrieverIdentifier.DiagnosticsRetriever
    private disposables: vscode.Disposable[] = []

    public async retrieve(options: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        const document = options.document
        const snippets: AutocompleteContextSnippet[] = []
        const diagnosticInformation = await this.getDiagnosticsForPosition(document, options.position)
        if (diagnosticInformation.length === 0) {
            return []
        }
        for (const diagnostic of diagnosticInformation) {
            const promptMessage = await this.getDiagnosticPromptMessage(diagnostic)
            snippets.push({
                identifier: RetrieverIdentifier.DiagnosticsRetriever,
                content: promptMessage,
                uri: document.uri,
                startLine: diagnostic.startLine,
                endLine: diagnostic.endLine,
            })
        }
        return snippets
    }
    private async getDiagnosticPromptMessage(diagnostic: DiagnosticInformation): Promise<string> {
        const xmlObj: Record<string, string> = {
            severity: diagnostic.severity,
            source: diagnostic.source || '',
            message: diagnostic.message,
            text: diagnostic.text,
            related_information_list: diagnostic.relatedInformation
                ? await this.getRelatedInformationPrompt(diagnostic.relatedInformation)
                : '',
        }
        const prompt = xmlBuilder.build({
            diagnostic: xmlObj,
        })
        return prompt
    }

    private async getRelatedInformationPrompt(
        relatedInformation: vscode.DiagnosticRelatedInformation[]
    ): Promise<string> {
        const relatedInformationList: Record<string, string>[] = []
        for (const info of relatedInformation) {
            const document = await vscode.workspace.openTextDocument(info.location.uri)
            relatedInformationList.push({
                message: info.message,
                file: info.location.uri.fsPath,
                text: document.getText(info.location.range),
            })
        }
        const prompt = xmlBuilder.build({
            related_information_list: {
                related_information: relatedInformationList,
            },
        })
        return prompt
    }

    private async getDiagnosticsForPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<DiagnosticInformation[]> {
        const diagnostics = vscode.languages
            .getDiagnostics(document.uri)
            .filter(
                diagnostic =>
                    diagnostic.severity === vscode.DiagnosticSeverity.Error ||
                    diagnostic.severity === vscode.DiagnosticSeverity.Warning
            )
        if (diagnostics.length === 0) {
            return []
        }
        const range = await this.getRangeFromPosition(document, position)
        const diagnosticInformation = await this.getDiagnosticInformationFromRange(
            document,
            diagnostics,
            range
        )
        return diagnosticInformation
    }

    private async getDiagnosticInformationFromRange(
        document: vscode.TextDocument,
        diagnostics: vscode.Diagnostic[],
        range: vscode.Range
    ): Promise<DiagnosticInformation[]> {
        const diagnosticsInformation: DiagnosticInformation[] = []
        for (const diagnostic of diagnostics) {
            const textAtRange = document.getText(range)
            diagnosticsInformation.push({
                severity:
                    diagnostic.severity === vscode.DiagnosticSeverity.Warning ? 'warning' : 'error',
                text: textAtRange,
                source: diagnostic.source,
                message: diagnostic.message,
                startLine: range.start.line,
                endLine: range.end.line,
                relatedInformation: diagnostic.relatedInformation,
            })
        }
        return diagnosticsInformation
    }

    private async getRangeFromPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.Range> {
        // Take a buffer of 3 lines before and after to expand the range, using smart selection can lead to very large ranges
        const startLine = Math.max(0, position.line - 3)
        const endLine = Math.min(document.lineCount - 1, position.line + 3)
        const startOfRange = new vscode.Position(startLine, 0)
        const endOfRange = document.lineAt(endLine).range.end
        return new vscode.Range(startOfRange, endOfRange)
    }

    public isSupportedForLanguageId(): boolean {
        return true
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
