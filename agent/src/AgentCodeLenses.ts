import type * as vscode from 'vscode'

/**
 * Simple helper around managing code lens and code action providers.
 *
 * The type parameter T should be something like `vscode.CodeActionProvider`
 *
 * Moved to separate file to keep agent.ts small.
 */
export class AgentProviders<T> {
    private id = 0
    private all = new Map<T, { id: number; disposable?: vscode.Disposable }>()
    public providers(): T[] {
        return [...this.all.keys()]
    }
    public removeProvider(provider: T): void {
        this.all.get(provider)?.disposable?.dispose()
        this.all.delete(provider)
    }
    public addProvider(provider: T, disposable?: vscode.Disposable): void {
        const id = this.id++
        this.all.set(provider, { id, disposable })
    }
}
