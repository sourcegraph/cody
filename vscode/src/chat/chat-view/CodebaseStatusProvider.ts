import * as vscode from 'vscode'

import {
    type ContextGroup,
    type ContextProvider,
    type ContextStatusProvider,
    type Disposable,
} from '@sourcegraph/cody-shared'

import { type SymfRunner } from '../../local-context/symf'

interface CodebaseIdentifiers {
    local: string
    remote?: string
    remoteRepoId?: string
    setting?: string
}

/**
 * Provides and signals updates to the current codebase identifiers to use in the chat panel.
 */

export class CodebaseStatusProvider implements vscode.Disposable, ContextStatusProvider {
    private disposables: vscode.Disposable[] = []
    private eventEmitter: vscode.EventEmitter<ContextStatusProvider> = new vscode.EventEmitter<ContextStatusProvider>()

    // undefined means uninitialized, null means there is no current codebase
    private _currentCodebase: CodebaseIdentifiers | null | undefined = undefined

    // undefined means symf is not active or there is no current codebase
    private symfIndexStatus?: 'unindexed' | 'indexing' | 'ready' | 'failed'

    constructor(private readonly symf: SymfRunner | null) {
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.updateStatus()),
            vscode.workspace.onDidChangeWorkspaceFolders(() => this.updateStatus()),
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('cody.codebase')) {
                    return this.updateStatus()
                }
                return Promise.resolve()
            }),
            this.eventEmitter
        )

        if (this.symf) {
            this.disposables.push(
                this.symf.onIndexStart(() => {
                    void this.updateStatus()
                }),
                this.symf.onIndexEnd(() => {
                    void this.updateStatus()
                })
            )
        }
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
    }

    public onDidChangeStatus(callback: (provider: ContextStatusProvider) => void): Disposable {
        return this.eventEmitter.event(callback)
    }

    public get status(): ContextGroup[] {
        if (this._currentCodebase === undefined) {
            void this.updateStatus()
            return []
        }
        const codebase = this._currentCodebase
        if (!codebase) {
            return []
        }

        const providers: ContextProvider[] = []
        providers.push(...this.getSymfIndexStatus())

        if (providers.length === 0) {
            return []
        }

        return [
            {
                name: codebase.local,
                providers,
            },
        ]
    }

    private getSymfIndexStatus(): ContextProvider[] {
        if (!this.symf || !this._currentCodebase || !this.symfIndexStatus) {
            return []
        }
        return [
            {
                kind: 'search',
                state: this.symfIndexStatus || 'unindexed',
            },
        ]
    }

    public async currentCodebase(): Promise<CodebaseIdentifiers | null> {
        if (this._currentCodebase === undefined) {
            // lazy initialization
            await this.updateStatus()
        }
        return this._currentCodebase || null
    }

    private async updateStatus(): Promise<void> {
        const didSymfStatusChange = await this._updateSymfStatus_NoFire()
        if (didSymfStatusChange) {
            this.eventEmitter.fire(this)
        }
    }

    private async _updateSymfStatus_NoFire(): Promise<boolean> {
        if (!this.symf) {
            return false
        }
        const newSymfStatus = this._currentCodebase?.local
            ? await this.symf.getIndexStatus(this._currentCodebase.local)
            : undefined
        const didSymfStatusChange = this.symfIndexStatus !== newSymfStatus
        this.symfIndexStatus = newSymfStatus
        return didSymfStatusChange
    }
}
