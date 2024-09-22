import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import { XMLBuilder } from 'fast-xml-parser'
import * as vscode from 'vscode'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { RetrieverIdentifier } from '../../utils'

const xmlBuilder = new XMLBuilder({ format: true })

interface DiagnosticInfo {
    severity: 'warning' | 'error'
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

    public async retrieve({ document }: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        const diagnostics = this.getDiagnosticsForFile(document)
        return this.getDiagnosticsPromptFromInformation(document, diagnostics)
    }

    public async getDiagnosticsPromptFromInformation(
        document: vscode.TextDocument,
        diagnostics: vscode.Diagnostic[]
    ): Promise<AutocompleteContextSnippet[]> {
        const relevantDiagnostics = diagnostics
            .filter(diagnostic => this.isRelevantDiagnostic(diagnostic))
            .map(diagnostic => ({
                severity: this.getSeverityString(diagnostic.severity),
                text: this.getDiagnosticsText(document, diagnostic),
                source: diagnostic.source,
                message: diagnostic.message,
                startLine: diagnostic.range.start.line,
                endLine: diagnostic.range.end.line,
                relatedInformation: diagnostic.relatedInformation,
            }))

        if (relevantDiagnostics.length === 0) {
            return []
        }

        return Promise.all(
            relevantDiagnostics.map(async info => ({
                identifier: RetrieverIdentifier.DiagnosticsRetriever,
                content: await this.getDiagnosticPromptMessage(info),
                uri: document.uri,
                startLine: info.startLine,
                endLine: info.endLine,
            }))
        )
    }

    private isRelevantDiagnostic(diagnostic: vscode.Diagnostic): boolean {
        return (
            diagnostic.severity === vscode.DiagnosticSeverity.Error ||
            diagnostic.severity === vscode.DiagnosticSeverity.Warning
        )
    }

    private getDiagnosticsForFile(document: vscode.TextDocument): vscode.Diagnostic[] {
        return vscode.languages.getDiagnostics(document.uri)
    }

    private async getDiagnosticPromptMessage(info: DiagnosticInfo): Promise<string> {
        const xmlObj: Record<string, string | undefined> = {
            severity: info.severity,
            source: info.source,
            message: info.message,
            text: info.text,
            related_information_list: info.relatedInformation
                ? await this.getRelatedInformationPrompt(info.relatedInformation)
                : undefined,
        }
        return xmlBuilder.build({ diagnostic: xmlObj })
    }

    private async getRelatedInformationPrompt(
        relatedInformation: vscode.DiagnosticRelatedInformation[]
    ): Promise<string> {
        const relatedInfoList = await Promise.all(
            relatedInformation.map(async info => {
                const document = await vscode.workspace.openTextDocument(info.location.uri)
                return {
                    message: info.message,
                    file: info.location.uri.fsPath,
                    text: document.getText(info.location.range),
                }
            })
        )
        return xmlBuilder.build({
            related_information_list: {
                related_information: relatedInfoList,
            },
        })
    }

    private getSeverityString(severity: vscode.DiagnosticSeverity): 'warning' | 'error' {
        return severity === vscode.DiagnosticSeverity.Warning ? 'warning' : 'error'
    }

    private getDiagnosticsText(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): string {
        const CONTEXT_LINES = 3
        const line = document.lineAt(diagnostic.range.start.line)
        const column = diagnostic.range.start.character - 1
        const diagnosticLength = Math.min(
            document.offsetAt(diagnostic.range.end) - document.offsetAt(diagnostic.range.start),
            // Take into account the \n char at the end of the line
            line.text.length + 1 - column
        )
        const diagnosticText = `${' '.repeat(column)}${'^'.repeat(diagnosticLength)} ${
            diagnostic.message
        }`

        // Add surrounding context to the diagnostic message
        const contextStartLine = Math.max(0, diagnostic.range.start.line - CONTEXT_LINES)
        const contextEndLine = Math.min(
            document.lineCount - 1,
            diagnostic.range.start.line + CONTEXT_LINES
        )
        const prevLines = document.getText(
            new vscode.Range(contextStartLine, 0, line.lineNumber, line.range.end.character)
        )
        const nextLines = document.getText(
            new vscode.Range(
                line.lineNumber + 1,
                0,
                contextEndLine,
                document.lineAt(contextEndLine).range.end.character
            )
        )
        const message = `${prevLines}\n${diagnosticText}\n${nextLines}`
        return message
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
