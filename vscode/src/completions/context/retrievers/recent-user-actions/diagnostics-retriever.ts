import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import { isDefined } from '@sourcegraph/cody-shared'
import { XMLBuilder } from 'fast-xml-parser'
import * as vscode from 'vscode'
import { autoeditsOutputChannelLogger } from '../../../../autoedits/output-channel-logger'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { RetrieverIdentifier } from '../../utils'
import { getCellIndexInActiveNotebookEditor, getNotebookCells } from './notebook-utils'

// XML builder instance for formatting diagnostic messages
const XML_BUILDER = new XMLBuilder({ format: true })

interface DiagnosticsRetrieverOptions {
    contextLines: number
    useXMLForPromptRendering: boolean
    useCaretToIndicateErrorLocation?: boolean
}

interface RelatedInfo {
    message: string
    file: string
    text: string
}

interface DiagnosticInfo {
    message: string
    line: number
    relatedInformation?: vscode.DiagnosticRelatedInformation[]
}

export class DiagnosticsRetriever implements vscode.Disposable, ContextRetriever {
    public identifier = RetrieverIdentifier.DiagnosticsRetriever
    private disposables: vscode.Disposable[] = []
    private contextLines: number
    private useXMLForPromptRendering: boolean
    private useCaretToIndicateErrorLocation: boolean

    constructor(options: DiagnosticsRetrieverOptions) {
        // Number of lines of context to include around the diagnostic information in the prompt
        this.contextLines = options.contextLines
        this.useXMLForPromptRendering = options.useXMLForPromptRendering
        this.useCaretToIndicateErrorLocation = options.useCaretToIndicateErrorLocation ?? true
    }

    public async retrieve({
        document,
        position,
    }: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        autoeditsOutputChannelLogger.logDebugIfVerbose(
            'diagnostics retriever',
            'Retrieving diagnostics context'
        )

        const diagnosticsSnippets =
            getCellIndexInActiveNotebookEditor(document) !== -1
                ? await this.getDiagnosticsForNotebook(position)
                : await this.getDiagnosticsForDocument(document, position)

        autoeditsOutputChannelLogger.logDebugIfVerbose(
            'diagnostics retriever',
            `Retrieved ${diagnosticsSnippets.length} diagnostics context`
        )
        return diagnosticsSnippets
    }

    private async getDiagnosticsForNotebook(
        position: vscode.Position
    ): Promise<AutocompleteContextSnippet[]> {
        const activeNotebook = vscode.window.activeNotebookEditor?.notebook
        if (!activeNotebook) {
            return []
        }
        const notebookCells = getNotebookCells(activeNotebook)
        const diagnostics = await Promise.all(
            notebookCells.map(cell => {
                const diagnostics = vscode.languages.getDiagnostics(cell.document.uri)
                return this.getDiagnosticsPromptFromInformation(cell.document, position, diagnostics)
            })
        )
        return diagnostics.flat().map(snippet => ({
            ...snippet,
            uri: activeNotebook!.uri,
        }))
    }

    private async getDiagnosticsForDocument(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<AutocompleteContextSnippet[]> {
        const diagnostics = vscode.languages.getDiagnostics(document.uri)
        const diagnosticsSnippets = await this.getDiagnosticsPromptFromInformation(
            document,
            position,
            diagnostics
        )
        return diagnosticsSnippets
    }

    public async getDiagnosticsPromptFromInformation(
        document: vscode.TextDocument,
        position: vscode.Position,
        diagnostics: vscode.Diagnostic[]
    ): Promise<AutocompleteContextSnippet[]> {
        const relevantDiagnostics = diagnostics.filter(
            diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error
        )
        const diagnosticInfos = this.getDiagnosticInfos(document, relevantDiagnostics).sort(
            (a, b) => Math.abs(a.line - position.line) - Math.abs(b.line - position.line)
        )
        return Promise.all(
            diagnosticInfos.map(async info => ({
                type: 'file',
                identifier: this.identifier,
                content: await this.getDiagnosticPromptMessage(info),
                uri: document.uri,
                startLine: info.line,
                endLine: info.line,
            }))
        )
    }

    private getDiagnosticInfos(
        document: vscode.TextDocument,
        diagnostics: vscode.Diagnostic[]
    ): DiagnosticInfo[] {
        const diagnosticsByLine = this.getDiagnosticsByLine(diagnostics)
        const diagnosticInfos: DiagnosticInfo[] = []

        for (const [line, lineDiagnostics] of diagnosticsByLine) {
            const diagnosticText = this.getDiagnosticsText(document, lineDiagnostics)
            if (diagnosticText) {
                diagnosticInfos.push({
                    message: diagnosticText,
                    line,
                    relatedInformation: lineDiagnostics.flatMap(d => d.relatedInformation || []),
                })
            }
        }

        return diagnosticInfos
    }

    private getDiagnosticsByLine(diagnostics: vscode.Diagnostic[]): Map<number, vscode.Diagnostic[]> {
        const map = new Map<number, vscode.Diagnostic[]>()
        for (const diagnostic of diagnostics) {
            const line = diagnostic.range.start.line
            if (!map.has(line)) {
                map.set(line, [])
            }
            map.get(line)!.push(diagnostic)
        }
        return map
    }

    private async getDiagnosticPromptMessage(info: DiagnosticInfo): Promise<string> {
        if (this.useXMLForPromptRendering) {
            return this.getDiagnosticPromptMessageXML(info)
        }
        return this.getDiagnosticPromptMessagePlainText(info)
    }

    private async getDiagnosticPromptMessagePlainText(info: DiagnosticInfo): Promise<string> {
        const errorMessage = info.message
        const relatedInfoList = info.relatedInformation
            ? (await this.getRelatedInformationPrompt(info.relatedInformation)).filter(isDefined)
            : []
        if (relatedInfoList.length === 0) {
            return errorMessage
        }
        const relatedInfoPrompt = relatedInfoList
            .map(info => `Err (Related Information) | ${info.message}, ${info.file}, ${info.text}`)
            .join('\n')
        return `${errorMessage}\n${relatedInfoPrompt}`
    }

    private async getDiagnosticPromptMessageXML(info: DiagnosticInfo): Promise<string> {
        const relatedInfoList = info.relatedInformation
            ? (await this.getRelatedInformationPrompt(info.relatedInformation)).filter(isDefined)
            : []
        const xmlObj: Record<string, string | undefined> = {
            message: info.message,
            related_information_list: XML_BUILDER.build(relatedInfoList),
        }
        return XML_BUILDER.build({ diagnostic: xmlObj })
    }

    private async getRelatedInformationPrompt(
        relatedInformation: vscode.DiagnosticRelatedInformation[]
    ): Promise<RelatedInfo[]> {
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
        return relatedInfoList
    }

    private getDiagnosticsText(
        document: vscode.TextDocument,
        diagnostics: vscode.Diagnostic[]
    ): string | undefined {
        if (diagnostics.length === 0) {
            return undefined
        }
        const diagnosticTextList = diagnostics.map(d => this.getDiagnosticMessage(document, d))
        const diagnosticText = diagnosticTextList.join('\n')

        return this.addSurroundingContext(document, diagnostics[0].range.start, diagnosticText)
    }

    private addSurroundingContext(
        document: vscode.TextDocument,
        diagnosticPosition: vscode.Position,
        diagnosticText: string
    ): string {
        if (document.lineCount === 0) {
            return diagnosticText
        }

        const diagnosticLine = document.validatePosition(diagnosticPosition).line
        const contextStartLine = Math.max(0, diagnosticLine - this.contextLines)
        const contextEndLine = Math.min(document.lineCount - 1, diagnosticLine + this.contextLines)
        const prevLines = document.getText(
            new vscode.Range(
                contextStartLine,
                0,
                diagnosticLine,
                document.lineAt(diagnosticLine).range.end.character
            )
        )

        if (this.contextLines === 0 || diagnosticLine + 1 > contextEndLine) {
            return `${prevLines}\n${diagnosticText}`
        }

        const nextLines = document.getText(
            new vscode.Range(
                diagnosticLine + 1,
                0,
                contextEndLine,
                document.lineAt(contextEndLine).range.end.character
            )
        )

        return `${prevLines}\n${diagnosticText}\n${nextLines}`
    }

    private getDiagnosticMessage(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): string {
        if (!this.useCaretToIndicateErrorLocation) {
            return `Err | ${diagnostic.message}`
        }

        if (document.lineCount === 0) {
            return diagnostic.message
        }

        const start = document.validatePosition(diagnostic.range.start)
        const end = document.validatePosition(diagnostic.range.end)

        const line = document.lineAt(start.line)
        const column = Math.max(0, start.character - 1)

        const diagnosticLength = Math.max(
            1,
            Math.min(document.offsetAt(end) - document.offsetAt(start), line.text.length + 1 - column)
        )
        return `${' '.repeat(column)}${'^'.repeat(diagnosticLength)} ${diagnostic.message}`
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
