import type * as vscode from 'vscode'

/**
 * Simple helper around managing code lens providers.
 *
 * Moved to separate file to keep agent.ts small.
 */
export class AgentCodeLenses {
    private id = 0
    private all = new Map<vscode.CodeLensProvider, { id: number; disposable?: vscode.Disposable }>()
    public providers(): vscode.CodeLensProvider[] {
        return [...this.all.keys()]
    }
    public remove(provider: vscode.CodeLensProvider): void {
        this.all.get(provider)?.disposable?.dispose()
        this.all.delete(provider)
    }
    public add(provider: vscode.CodeLensProvider, disposable?: vscode.Disposable): void {
        const id = this.id++
        this.all.set(provider, { id, disposable })
    }
}
