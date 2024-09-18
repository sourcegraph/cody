import {
    abortableOperation,
    authStatus,
    combineLatest,
    debounceTime,
    graphqlClient,
    isAbortError,
    isError,
    logDebug,
    resolvedConfig,
    startWith,
    subscriptionDisposable,
} from '@sourcegraph/cody-shared'
import { type Observable, Subject } from 'observable-fns'
import * as vscode from 'vscode'
import { vscodeGitAPI } from '../repository/git-extension-api'
import { repoNameResolver } from '../repository/repo-name-resolver'
import type { CodebaseRepoIdMapper } from './remote-repo'
import type { Repo } from './remote-repo'
import { RemoteSearch } from './remote-search'

// TODO(dpc): The vscode.git extension has an delay before we can fetch a
// workspace folder's remote. Switch to cody-engine instead of depending on
// vscode.git and this arbitrary delay.
const GIT_REFRESH_DELAY = 2000

// Watches the VSCode workspace roots and maps any it finds to remote repository
// IDs. This depends on the vscode.git extension for mapping git repositories
// to their remotes.
export class WorkspaceRepoMapper implements vscode.Disposable, CodebaseRepoIdMapper {
    private disposables: vscode.Disposable[] = []
    // The workspace repos.
    private repos: Repo[] = []
    // A cache of results for non-workspace repos. This caches repos that are
    // not found, as well as repo IDs.
    private nonWorkspaceRepos = new Map<string, string | undefined>()
    private started: Promise<void> | undefined

    private changesSubject = new Subject<void>()

    constructor() {
        this.disposables.push(
            subscriptionDisposable(
                authStatus.subscribe(() => {
                    this.start()
                })
            ),
            subscriptionDisposable(
                combineLatest([authStatus, resolvedConfig])
                    .pipe(
                        debounceTime(0),
                        abortableOperation((_, signal) => this.updateRepos(signal))
                    )
                    .subscribe({})
            )
        )
    }

    public get changes(): Observable<void> {
        return this.changesSubject.pipe(startWith(undefined))
    }

    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
        this.disposables = []
    }

    // CodebaseRepoIdMapper implementation.
    public async repoForCodebase(repoName: string): Promise<Repo | undefined> {
        if (!repoName) {
            return
        }
        // Check workspace repository list.
        const item = this.repos.find(item => item.name === repoName)
        if (item) {
            return {
                id: item.id,
                name: item.name,
            }
        }
        // Check cached, non-workspace repository list.
        if (this.nonWorkspaceRepos.has(repoName)) {
            const id = this.nonWorkspaceRepos.get(repoName)
            return id
                ? {
                      id,
                      name: repoName,
                  }
                : undefined
        }
        const result = await graphqlClient.getRepoId(repoName)
        if (isError(result)) {
            throw result
        }
        this.nonWorkspaceRepos.set(repoName, result || undefined)
        return result
            ? {
                  name: repoName,
                  id: result,
              }
            : undefined
    }

    // Fetches the set of repo IDs and starts listening for workspace changes.
    // After this Promise resolves, `workspaceRepoIds` contains the set of
    // repo IDs for the workspace (if any.)
    private async start(): Promise<void> {
        // If are already starting/started, then join that.
        if (this.started) {
            return this.started
        }

        this.started = (async () => {
            vscode.workspace.onDidChangeWorkspaceFolders(
                async () => {
                    logDebug('WorkspaceRepoMapper', 'Workspace folders changed, updating repos')
                    setTimeout(async () => await this.updateRepos(), GIT_REFRESH_DELAY)
                },
                undefined,
                this.disposables
            )
            // TODO: Only works in the VS Code extension where the Git extension is available.
            // https://github.com/sourcegraph/cody/issues/4138
            vscodeGitAPI?.onDidOpenRepository(
                async () => {
                    logDebug('WorkspaceRepoMapper', 'vscode.git repositories changed, updating repos')
                    setTimeout(async () => await this.updateRepos(), GIT_REFRESH_DELAY)
                },
                undefined,
                this.disposables
            )
        })()

        return this.started
    }

    // Updates the `workspaceRepos` property and fires the change event.
    private async updateRepos(signal?: AbortSignal): Promise<void> {
        try {
            const folders = vscode.workspace.workspaceFolders || []
            logDebug(
                'WorkspaceRepoMapper',
                `Mapping ${folders.length} workspace folders to repos: ${folders
                    .map(f => f.uri.toString())
                    .join()}`
            )
            this.repos = await this.findRepos(folders, signal)
            logDebug(
                'WorkspaceRepoMapper',
                `Mapped workspace folders to repos: ${JSON.stringify(this.repos.map(repo => repo.name))}`
            )
        } catch (error) {
            if (!isAbortError(error)) {
                logDebug('WorkspaceRepoMapper', `Error mapping workspace folders to repo IDs: ${error}`)
                throw error
            }
        }
        this.changesSubject.next()
    }

    // Given a set of workspace folders, looks up their git remotes and finds the related repo IDs,
    // if any.
    private async findRepos(
        folders: readonly vscode.WorkspaceFolder[],
        signal?: AbortSignal
    ): Promise<Repo[]> {
        repoNameResolver.clearCache()
        const repoNames = (
            await Promise.all(
                folders.map(folder => {
                    return repoNameResolver.getRepoNamesFromWorkspaceUri(folder.uri, signal)
                })
            )
        ).flat()
        logDebug(
            'WorkspaceRepoMapper',
            `Found ${repoNames.length} repo names: ${JSON.stringify(repoNames)}`
        )
        signal?.throwIfAborted()

        const uniqueRepoNames = new Set(repoNames)
        if (uniqueRepoNames.size === 0) {
            // Otherwise we fetch the first 10 repos from the Sourcegraph instance
            return []
        }
        const repos = await graphqlClient.getRepoIds(
            [...uniqueRepoNames.values()],
            RemoteSearch.MAX_REPO_COUNT,
            signal
        )
        signal?.throwIfAborted()
        if (isError(repos)) {
            throw repos
        }

        return repos
    }
}
