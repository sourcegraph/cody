import { type URIString, uriString } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'

export class AgentDiagnostics {
    private diagnostics = new Map<URIString, readonly vscode.Diagnostic[]>()
    public publish(newDiagnostics: Map<URIString, readonly vscode.Diagnostic[]>): void {
        for (const [key, value] of newDiagnostics.entries()) {
            this.diagnostics.set(key, value)
        }
    }
    public forUri(uri: vscode.Uri): readonly vscode.Diagnostic[] {
        return this.diagnostics.get(uriString(uri)) ?? []
    }
}
