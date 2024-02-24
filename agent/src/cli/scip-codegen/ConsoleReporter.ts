import { readFileSync } from 'fs'
import path from 'path'
import { URI } from 'vscode-uri'
import { type Diagnostic, Severity } from './Diagnostic'
import { scip } from './scip'

export class ConsoleReporter {
    public diagnostics: Diagnostic[] = []
    private c: Console
    private maxSeverity: Severity

    constructor(
        private readonly index: scip.Index,
        params: { console?: Console; severity: 'error' | 'warning' }
    ) {
        this.c = params.console ?? console
        this.maxSeverity = params.severity === 'error' ? Severity.Error : Severity.Warning
    }

    public hasErrors(): boolean {
        return this.errorCount() > 0
    }

    public errorCount(): number {
        return this.diagnostics.filter(({ severity }) => severity === Severity.Error).length
    }

    public reportErrorCount(): void {
        const count = this.errorCount()
        if (count === 0) {
            return
        }
        this.c.error(count === 1 ? '1 error' : `${count} errors`)
    }
    public warn(symbol: string, message: string): void {
        this.report({ severity: Severity.Warning, symbol, message })
    }
    public error(symbol: string, message: string): void {
        this.report({ severity: Severity.Error, symbol, message })
    }
    public report(diagnostic: Diagnostic): void {
        if (diagnostic.severity < this.maxSeverity) {
            return
        }
        this.diagnostics.push(diagnostic)
        this.reportDiagnostic(diagnostic)
        for (const extra of diagnostic.additionalInformation ?? []) {
            this.reportDiagnostic(extra)
        }
    }

    private reportDiagnostic(diagnostic: Diagnostic): void {
        const definition = this.definition(diagnostic.symbol)
        if (!definition) {
            // TODO: infer a better location to report this warning, for example
            // where the symbol is referenced from protocol types.
            const [, , ...symbol] = diagnostic.symbol.split(' ')
            const severity = Severity[diagnostic.severity].toLowerCase()
            this.c.error(`${severity}: "${symbol.join(' ')}": ${diagnostic.message}`)
            return
        }

        const text = this.format(diagnostic, definition.document, definition.occ)
        this.c.error(text)
    }

    private definition(symbol: string): { document: scip.Document; occ: scip.Occurrence } | undefined {
        for (const document of this.index.documents) {
            for (const occ of document.occurrences) {
                if (occ.symbol_roles & scip.SymbolRole.Definition && occ.symbol === symbol) {
                    return { document, occ }
                }
            }
        }
        return undefined
    }

    private readDocument(document: scip.Document): { absolutePath: string; text: string } {
        const absolutePath = path.join(
            URI.parse(this.index.metadata.project_root).fsPath,
            document.relative_path
        )
        if (!document.text) {
            const text = readFileSync(absolutePath, 'utf8').toString()
            document.text = text
        }
        return { absolutePath, text: document.text }
    }

    private format(
        diagnostic: Diagnostic,
        document: scip.Document,
        occurrence: scip.Occurrence
    ): string {
        const { absolutePath, text } = this.readDocument(document)
        const lines = text.split('\n')
        const startLine = occurrence.range[0]
        const startCharacter = occurrence.range[1]
        const endCharacter = occurrence.range.length === 3 ? occurrence.range[2] : startCharacter
        const out: string[] = []
        const severity = Severity[diagnostic.severity].toLowerCase()
        const isMultiline = diagnostic.message.includes('\n')
        const [header, suffix] = isMultiline ? ['', diagnostic.message] : [` ${diagnostic.message}`, '']
        out.push(`${severity}: ${absolutePath}:${startLine}:${startCharacter}:${header}`)
        const count = this.diagnostics.length
        out.push(count.toString().padStart(4) + '| ' + lines[startLine])
        out.push('    | ' + ' '.repeat(startCharacter) + '^'.repeat(endCharacter - startCharacter))
        out.push(suffix)
        return out.join('\n')
    }
}
