import type * as vscode from 'vscode'
import { UriString } from './vscode-shim'

export class AgentDiagnostics {
    private diagnostics = new Map<UriString, readonly vscode.Diagnostic[]>()
    public publish(newDiagnostics: Map<UriString, readonly vscode.Diagnostic[]>): void {
        for (const [key, value] of newDiagnostics.entries()) {
            this.diagnostics.set(key, value)
        }
    }
    public forUri(uri: vscode.Uri): readonly vscode.Diagnostic[] {
        return this.diagnostics.get(UriString.fromUri(uri)) ?? []
    }
}
