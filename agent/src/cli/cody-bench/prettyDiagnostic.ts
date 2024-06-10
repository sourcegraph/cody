import * as vscode from 'vscode'
import type { ProtocolDiagnostic } from '../../protocol-alias'

export function prettyDiagnosticMessage(d: ProtocolDiagnostic): string {
    return `[TS${d.code}] ${d.message}`
}
export function prettyDiagnostic(d: ProtocolDiagnostic): string {
    const file = vscode.Uri.parse(d.location.uri).fsPath
    return `${file}:${d.location.range.start.line + 1}:${d.location.range.start.character} ${d.code} ${
        d.message
    }`
}
