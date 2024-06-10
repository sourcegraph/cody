import type * as vscode from 'vscode'

export class AgentDiagnostics {
    private diagnostics = new Map<string, vscode.Diagnostic[]>()
    public publish(newDiagnostics: Map<string, vscode.Diagnostic[]>): void {
        for (const [key, value] of newDiagnostics.entries()) {
            this.diagnostics.set(key, value)
        }
    }
    public forUri(uri: vscode.Uri): vscode.Diagnostic[] {
        return this.diagnostics.get(uri.toString()) ?? []
    }
}
