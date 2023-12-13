import { isEqual } from 'lodash'
import * as vscode from 'vscode'

import { ActiveTextEditorSelectionRange } from '@sourcegraph/cody-shared'
import {
    ContextGroup,
    ContextProvider,
    ContextStatusProvider,
    Disposable,
} from '@sourcegraph/cody-shared/src/codebase-context/context-status'
import { ContextFile, ContextMessage } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { Editor } from '@sourcegraph/cody-shared/src/editor'
import { isDotCom } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { convertGitCloneURLToCodebaseName, isError } from '@sourcegraph/cody-shared/src/utils'

import { SymfRunner } from '../../local-context/symf'
import { repositoryRemoteUrl } from '../../repository/repositoryHelpers'
import { CachedRemoteEmbeddingsClient } from '../CachedRemoteEmbeddingsClient'

import { ContextItem } from './SimpleChatModel'

export const relativeFileUrlScheme = 'cody-file-relative'
export const embeddingsUrlScheme = 'cody-embeddings'

export function relativeFileUrl(fileName: string, range?: vscode.Range): vscode.Uri {
    return vscode.Uri.from({
        scheme: relativeFileUrlScheme,
        path: fileName,
        fragment: range && `L${range.start.line}-${range.end.line}`,
    })
}

// The approximate inverse of CodebaseContext.makeContextMessageWithResponse
export function contextMessageToContextItem(contextMessage: ContextMessage): ContextItem | null {
    if (!contextMessage.text) {
        return null
    }
    const contextText = stripContextWrapper(contextMessage.text)
    if (!contextText) {
        return null
    }
    if (!contextMessage.file) {
        return null
    }
    const range = contextMessage.file.range
    return {
        text: contextText,
        uri:
            contextMessage.file.uri ||
            relativeFileUrl(contextMessage.file.fileName, activeEditorSelectionRangeToRange(range)),
        range: range && new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character),
    }
}

export function stripContextWrapper(text: string): string | undefined {
    {
        const start = text.indexOf('Use following code snippet')
        if (start >= 0) {
            text = text.slice(start)
            const lines = text.split('\n')
            return lines.slice(2, -1).join('\n')
        }
    }
    {
        const start = text.indexOf('Use the following text from file')
        if (start >= 0) {
            text = text.slice(start)
            const lines = text.split('\n')
            return lines.slice(1).join('\n')
        }
    }
    {
        const start = text.indexOf('My selected ')
        const selectedStart = text.indexOf('<selected>')
        const selectedEnd = text.indexOf('</selected>')
        if (start >= 0 && selectedStart >= 0 && selectedEnd >= 0) {
            text = text.slice(selectedStart, selectedEnd)
            const lines = text.split('\n')
            return lines.slice(1, -1).join('\n')
        }
    }
    return undefined
}

export function contextItemsToContextFiles(items: ContextItem[]): ContextFile[] {
    const contextFiles: ContextFile[] = []
    for (const item of items) {
        let relFsPath = item.uri.fsPath
        if (relFsPath.startsWith('/')) {
            relFsPath = relFsPath.slice(1)
        }
        contextFiles.push({
            fileName: relFsPath,
            source: 'embeddings',
            range: rangeToActiveTextEditorSelectionRange(item.range),
            content: item.text,
        })
    }
    return contextFiles
}

export function rangeToActiveTextEditorSelectionRange(
    range?: vscode.Range
): ActiveTextEditorSelectionRange | undefined {
    if (!range) {
        return undefined
    }
    return {
        start: {
            line: range.start.line,
            character: range.start.character,
        },
        end: {
            line: range.end.line,
            character: range.end.character,
        },
    }
}

function activeEditorSelectionRangeToRange(range?: ActiveTextEditorSelectionRange): vscode.Range | undefined {
    if (!range) {
        return undefined
    }
    return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character)
}

export function getChatPanelTitle(lastDisplayText?: string, truncateTitle = true): string {
    if (!lastDisplayText) {
        return 'New Chat'
    }
    // Regex to remove the markdown formatted links with this format: '[_@FILENAME_]()'
    const MARKDOWN_LINK_REGEX = /\[_(.+?)_]\((.+?)\)/g
    lastDisplayText = lastDisplayText.replaceAll(MARKDOWN_LINK_REGEX, '$1')?.trim()
    if (!truncateTitle) {
        return lastDisplayText
    }
    // truncate title that is too long
    return lastDisplayText.length > 25 ? lastDisplayText.slice(0, 25).trim() + '...' : lastDisplayText
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

    constructor(
        private readonly editor: Editor,
        private readonly embeddingsClient: CachedRemoteEmbeddingsClient,
        private readonly symf: SymfRunner | null
    ) {
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.updateStatus()),
            vscode.workspace.onDidChangeWorkspaceFolders(() => this.updateStatus()),
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
        providers.push(...this.getRemoteEmbeddingsStatus())
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

    private getRemoteEmbeddingsStatus(): ContextProvider[] {
        const codebase = this._currentCodebase
        if (!codebase) {
            return []
        }
        if (codebase?.remote && codebase?.remoteRepoId) {
            return [
                {
                    kind: 'embeddings',
                    type: 'remote',
                    state: 'ready',
                    origin: this.embeddingsClient.getEndpoint(),
                    remoteName: codebase.remote,
                },
            ]
        }
        if (!codebase?.remote || isDotCom(this.embeddingsClient.getEndpoint())) {
            // Dotcom users or no remote codebase name: remote embeddings omitted from context
            return []
        }
        // Enterprise users where no repo ID is found for the desired remote codebase name: no-match context group
        return [
            {
                kind: 'embeddings',
                type: 'remote',
                state: 'no-match',
                origin: this.embeddingsClient.getEndpoint(),
                remoteName: codebase.remote,
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
        if (
            this._currentCodebase !== undefined &&
            workspaceRoot?.fsPath === this._currentCodebase?.local &&
            this._currentCodebase?.remoteRepoId
        ) {
            // do nothing if local codebase identifier is unchanged and we have a remote repo ID
            return false
        }

        let newCodebase: CodebaseIdentifiers | null = null
        if (workspaceRoot) {
            newCodebase = { local: workspaceRoot.fsPath }
            const remoteUrl = repositoryRemoteUrl(workspaceRoot)
            if (remoteUrl) {
                newCodebase.remote = convertGitCloneURLToCodebaseName(remoteUrl) || undefined
                if (newCodebase.remote) {
                    const repoId = await this.embeddingsClient.getRepoIdIfEmbeddingExists(newCodebase.remote)
                    if (!isError(repoId)) {
                        newCodebase.remoteRepoId = repoId ?? undefined
                    }
                }
            }
        }

        const didCodebaseChange = !isEqual(this._currentCodebase, newCodebase)
        this._currentCodebase = newCodebase
        return didCodebaseChange
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

interface CodebaseIdentifiers {
    local: string
    remote?: string
    remoteRepoId?: string
}
