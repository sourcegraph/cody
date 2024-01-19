import { isEqual } from 'lodash'
import * as vscode from 'vscode'

import {
    isFileURI,
    uriBasename,
    type ContextGroup,
    type ContextProvider,
    type ContextStatusProvider,
    type Disposable,
    type Editor,
} from '@sourcegraph/cody-shared'

import { getConfiguration } from '../../configuration'
import { getEditor } from '../../editor/active-editor'
import type { SymfRunner } from '../../local-context/symf'
import { getCodebaseFromWorkspaceUri } from '../../repository/repositoryHelpers'
import type { CodebaseRepoIdMapper } from '../../context/enterprise-context-factory'

interface CodebaseIdentifiers {
    localFolder: vscode.Uri
    remote?: string
    remoteRepoId?: string
    setting?: string
}

/**
 * Provides and signals updates to the current codebase identifiers to use in the chat panel.
 */

export class CodebaseStatusProvider implements vscode.Disposable, ContextStatusProvider {
    private disposables: vscode.Disposable[] = []
    private eventEmitter: vscode.EventEmitter<ContextStatusProvider> =
        new vscode.EventEmitter<ContextStatusProvider>()

    // undefined means uninitialized, null means there is no current codebase
    private _currentCodebase: CodebaseIdentifiers | null | undefined = undefined

    // undefined means symf is not active or there is no current codebase
    private symfIndexStatus?: 'unindexed' | 'indexing' | 'ready' | 'failed'

    constructor(
        private readonly editor: Editor,
        private readonly symf: SymfRunner | null,
        private readonly codebaseRepoIdMapper: CodebaseRepoIdMapper | null
    ) {
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
                dir: codebase.localFolder,
                displayName: uriBasename(codebase.localFolder),
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
                type: 'local',
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
        const didCodebaseChange = await this._updateCodebase_NoFire()
        const didSymfStatusChange = await this._updateSymfStatus_NoFire()
        if (didCodebaseChange || didSymfStatusChange) {
            this.eventEmitter.fire(this)
        }
    }

    private async _updateCodebase_NoFire(): Promise<boolean> {
        const workspaceRoot = this.editor.getWorkspaceRootUri()
        const config = getConfiguration()
        if (
            this._currentCodebase !== undefined &&
            // TODO(dpc): This comparison must always fail because one is a string and one is a URI
            workspaceRoot?.toString() === this._currentCodebase?.localFolder &&
            config.codebase === this._currentCodebase?.setting &&
            this._currentCodebase?.remoteRepoId
        ) {
            // do nothing if local codebase identifier is unchanged and we have a remote repo ID
            return Promise.resolve(false)
        }

        let newCodebase: CodebaseIdentifiers | null = null
        if (workspaceRoot) {
            newCodebase = { localFolder: workspaceRoot, setting: config.codebase }
            const currentFile = getEditor()?.active?.document?.uri
            // Get codebase from config or fallback to getting codebase name from current file URL
            // Always use the codebase from config as this is manually set by the user
            newCodebase.remote =
                // TODO(dpc): config.codebase is set to the first workspace folder, even if the cody.codebase setting is not explicitly set,
                // so changing the current file never has an effect.
                config.codebase ||
                (currentFile ? getCodebaseFromWorkspaceUri(currentFile) : config.codebase)
            if (newCodebase.remote) {
                newCodebase.remoteRepoId = (
                    await this.codebaseRepoIdMapper?.repoForCodebase(newCodebase.remote)
                )?.id
            }
        }

        const didCodebaseChange = !isEqual(this._currentCodebase, newCodebase)
        this._currentCodebase = newCodebase
        return Promise.resolve(didCodebaseChange)
    }

    private async _updateSymfStatus_NoFire(): Promise<boolean> {
        if (!this.symf) {
            return false
        }
        const newSymfStatus =
            this._currentCodebase?.localFolder && isFileURI(this._currentCodebase.localFolder)
                ? await this.symf.getIndexStatus(this._currentCodebase.localFolder)
                : undefined
        const didSymfStatusChange = this.symfIndexStatus !== newSymfStatus
        this.symfIndexStatus = newSymfStatus
        return didSymfStatusChange
    }
}
