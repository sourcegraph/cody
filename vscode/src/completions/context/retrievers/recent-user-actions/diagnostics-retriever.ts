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

    public async retrieve({
        document,
        position,
    }: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        const diagnostics = this.getDiagnosticsForFile(document)
        return this.getDiagnosticsPromptFromInformation(document, position, diagnostics)
    }

    public async getDiagnosticsPromptFromInformation(
        document: vscode.TextDocument,
        position: vscode.Position,
        diagnostics: vscode.Diagnostic[]
    ): Promise<AutocompleteContextSnippet[]> {
        const filteredDiagnostics = diagnostics.filter(this.isRelevantDiagnostic)
        const diagnosticInfo = this.getDiagnosticsForPosition(document, position, filteredDiagnostics)
        if (diagnosticInfo.length === 0) {
            return []
        }
        return Promise.all(
            diagnosticInfo.map(async info => ({
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

    private getDiagnosticsForPosition(
        document: vscode.TextDocument,
        position: vscode.Position,
        diagnostics: vscode.Diagnostic[]
    ): DiagnosticInfo[] {
        const range = this.getRangeAroundPosition(document, position)
        return this.getDiagnosticInfoFromRange(document, diagnostics, range)
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

    private getDiagnosticInfoFromRange(
        document: vscode.TextDocument,
        diagnostics: vscode.Diagnostic[],
        range: vscode.Range
    ): DiagnosticInfo[] {
        return diagnostics
            .filter(diagnostic => diagnostic.range.intersection(range))
            .map(diagnostic => ({
                severity: this.getSeverityString(diagnostic.severity),
                text: document.getText(range),
                source: diagnostic.source,
                message: diagnostic.message,
                startLine: range.start.line,
                endLine: range.end.line,
                relatedInformation: diagnostic.relatedInformation,
            }))
    }

    private getSeverityString(severity: vscode.DiagnosticSeverity): 'warning' | 'error' {
        return severity === vscode.DiagnosticSeverity.Warning ? 'warning' : 'error'
    }

    private getRangeAroundPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.Range {
        const startLine = Math.max(0, position.line - 3)
        const endLine = Math.min(document.lineCount - 1, position.line + 3)
        return new vscode.Range(new vscode.Position(startLine, 0), document.lineAt(endLine).range.end)
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
