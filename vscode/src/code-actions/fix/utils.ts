import type * as vscode from 'vscode'

export function getDiagnosticCode(diagnosticCode: vscode.Diagnostic['code']): string | undefined {
    if (!diagnosticCode) {
        return
    }

    const code = typeof diagnosticCode === 'object' ? diagnosticCode.value : diagnosticCode
    return code.toString()
}
