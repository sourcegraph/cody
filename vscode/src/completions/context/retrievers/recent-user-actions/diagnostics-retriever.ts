import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import { XMLBuilder } from 'fast-xml-parser'
import * as vscode from 'vscode'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { RetrieverIdentifier } from '../../utils'

const xmlBuilder = new XMLBuilder({ format: true })

interface DiagnosticInfo {
    message: string
    line: number
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
        const relevantDiagnostics = diagnostics.filter(diagnostic =>
            this.isRelevantDiagnostic(diagnostic, position, document)
        )
        const diagnosticsByLine = this.getDiagnosticsByLine(relevantDiagnostics)

        const diagnosticInfos: DiagnosticInfo[] = []
        for (const [line, diagnostics] of diagnosticsByLine) {
            const diagnosticText = this.getDiagnosticsText(document, diagnostics)
            if (diagnosticText) {
                diagnosticInfos.push({
                    message: diagnosticText,
                    line,
                    relatedInformation: diagnostics.flatMap(d => d.relatedInformation || []),
                })
            }
        }

        return Promise.all(
            diagnosticInfos.map(async info => ({
                identifier: RetrieverIdentifier.DiagnosticsRetriever,
                content: await this.getDiagnosticPromptMessage(info),
                uri: document.uri,
                startLine: info.line,
                endLine: info.line,
            }))
        )
    }

    private getDiagnosticsByLine(diagnostics: vscode.Diagnostic[]): Map<number, vscode.Diagnostic[]> {
        const diagnosticsByLine = new Map<number, vscode.Diagnostic[]>()
        for (const diagnostic of diagnostics) {
            const line = diagnostic.range.start.line
            if (!diagnosticsByLine.has(line)) {
                diagnosticsByLine.set(line, [])
            }
            diagnosticsByLine.get(line)!.push(diagnostic)
        }
        return diagnosticsByLine
    }

    private isRelevantDiagnostic(
        diagnostic: vscode.Diagnostic,
        position: vscode.Position,
        document: vscode.TextDocument
    ): boolean {
        const BUFFER_LINES = 3
        const expandedRange = new vscode.Range(
            new vscode.Position(Math.max(0, diagnostic.range.start.line - BUFFER_LINES), 0),
            new vscode.Position(
                Math.min(document.lineCount, diagnostic.range.end.line + BUFFER_LINES),
                document.lineAt(
                    Math.min(document.lineCount - 1, diagnostic.range.end.line + BUFFER_LINES)
                ).text.length
            )
        )

        const isPositionInRange = expandedRange.contains(position)
        const isRelevantSeverity = diagnostic.severity === vscode.DiagnosticSeverity.Error

        return isPositionInRange && isRelevantSeverity
    }

    private getDiagnosticsForFile(document: vscode.TextDocument): vscode.Diagnostic[] {
        return vscode.languages.getDiagnostics(document.uri)
    }

    private async getDiagnosticPromptMessage(info: DiagnosticInfo): Promise<string> {
        const xmlObj: Record<string, string | undefined> = {
            message: info.message,
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
        return xmlBuilder.build(relatedInfoList)
    }

    private getDiagnosticsText(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic[]
    ): string | undefined {
        if (diagnostic.length === 0) {
            return undefined
        }
        const CONTEXT_LINES = 3
        const diagnosticTextList = diagnostic.map(d => this.getDiagnosticMessage(document, d))
        if (diagnosticTextList.length === 0) {
            return undefined
        }
        const diagnosticText = diagnosticTextList.join('\n')
        const diagnosticLine = diagnostic[0].range.start.line
        const line = document.lineAt(diagnosticLine)

        // Add surrounding context to the diagnostic message
        const contextStartLine = Math.max(0, diagnosticLine - CONTEXT_LINES)
        const contextEndLine = Math.min(document.lineCount - 1, diagnosticLine + CONTEXT_LINES)
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

    private getDiagnosticMessage(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): string {
        const line = document.lineAt(diagnostic.range.start.line)
        const column = Math.max(0, diagnostic.range.start.character - 1)
        const diagnosticLength = Math.max(
            1,
            Math.min(
                document.offsetAt(diagnostic.range.end) - document.offsetAt(diagnostic.range.start),
                // Take into account the \n char at the end of the line
                line.text.length + 1 - column
            )
        )
        const diagnosticText = `${' '.repeat(column)}${'^'.repeat(diagnosticLength)} ${
            diagnostic.message
        }`
        return diagnosticText
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
