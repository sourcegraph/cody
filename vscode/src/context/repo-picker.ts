import * as vscode from 'vscode'

import { logDebug } from '../log'
import { RemoteSearch } from './remote-search'
import type { WorkspaceRepoMapper } from './workspace-repo-mapper'
import { type Repo, type RepoFetcher, RepoFetcherState } from './repo-fetcher'

// A quickpick for choosing a set of repositories from a Sourcegraph instance.
export class RemoteRepoPicker implements vscode.Disposable {
    private readonly maxSelectedRepoCount: number = RemoteSearch.MAX_REPO_COUNT - 1
    private disposables: vscode.Disposable[] = []
    private readonly quickpick: vscode.QuickPick<vscode.QuickPickItem & Repo>
    private prefetchedRepos: Map<string, Repo> = new Map()

    constructor(
        private readonly fetcher: RepoFetcher,
        private readonly workspaceRepoMapper: WorkspaceRepoMapper
    ) {
        this.fetcher.onRepoListChanged(() => this.handleRepoListChanged(), undefined, this.disposables)
        this.fetcher.onStateChanged(
            state => {
                this.quickpick.busy = state === RepoFetcherState.Fetching
                if (state === RepoFetcherState.Errored) {
                    void vscode.window.showErrorMessage(
                        `Failed to fetch repository list: ${this.fetcher.lastError?.message}`
                    )
                }
            },
            undefined,
            this.disposables
        )

        this.quickpick = vscode.window.createQuickPick<vscode.QuickPickItem & Repo>()
        this.quickpick.matchOnDetail = true
        this.quickpick.canSelectMany = true
        this.updateTitle()

        this.quickpick.onDidChangeSelection(
            selection => {
                if (selection.length === this.maxSelectedRepoCount + 1) {
                    void vscode.window.showWarningMessage(
                        `You can only select up to ${this.maxSelectedRepoCount} repositories.`
                    )
                }
                this.updateTitle()
            },
            undefined,
            this.disposables
        )
    }

    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
        this.disposables = []
        this.quickpick.dispose()
    }

    private updateTitle(): void {
        const remaining = this.maxSelectedRepoCount - this.quickpick.selectedItems.length
        this.quickpick.placeholder =
            remaining === 0 ? 'Click OK to continue' : 'Type to search repositories...'
        if (remaining === 0) {
            this.quickpick.title = '✅ Choose repositories'
        } else if (remaining === 1) {
            this.quickpick.title = '✨ Choose the last repository'
        } else if (remaining > 0) {
            this.quickpick.title = `Choose up to ${remaining} more repositories`
        } else {
            this.quickpick.title = `❌ Too many repositories selected: Uncheck ${-remaining} to continue`
        }
    }

    // Gets a set of default repositories to search if none were specified.
    public async getDefaultRepos(): Promise<Repo[]> {
        await this.workspaceRepoMapper.start()
        // Take up to the first N repos from the workspace.
        return this.workspaceRepoMapper.workspaceRepos.slice(0, this.maxSelectedRepoCount)
    }

    // Shows the remote repo picker. Resolves with `undefined` if the user
    // dismissed the dialog with ESC, a click away, etc.
    public show(selection: Repo[]): Promise<Repo[] | undefined> {
        logDebug('RepoPicker', 'showing; fetcher state =', this.fetcher.state)

        let onDone = { resolve: (_: Repo[] | undefined) => {}, reject: (error: Error) => {} }
        const promise = new Promise<Repo[] | undefined>((resolve, reject) => {
            onDone = { resolve, reject }
        })

        // Store the repos selected by default so we can display them even if
        // they have not been loaded by the RepoFetcher yet.
        this.prefetchedRepos = new Map(
            selection.map(repo => [repo.id, { id: repo.id, name: repo.name }])
        )

        // Set the initial selection to the default selection.
        this.quickpick.selectedItems = this.quickpick.items = selection.map(repo => ({
            id: repo.id,
            label: repo.name,
            name: repo.name,
        }))
        this.handleRepoListChanged()

        // Ensure the workspace folder -> repository mapper has started so
        // the user can choose repositories from their workspace from a short
        // list.
        void this.workspaceRepoMapper.start()
        const workspaceChange = this.workspaceRepoMapper.onChange(() => this.handleRepoListChanged())
        void promise.finally(() => workspaceChange.dispose())

        // Refresh the repo list.
        if (this.fetcher.state !== RepoFetcherState.Complete) {
            logDebug('RepoPicker', 'continuing to fetch repositories list')
            this.fetcher.resume()
        }

        // Stop fetching repositories when the quickpick is dismissed.
        const didHide = this.quickpick.onDidHide(() => {
            if (this.fetcher.state !== RepoFetcherState.Complete) {
                logDebug('RepoPicker', 'pausing repo list fetching on hide')
                this.fetcher.pause()
            }
            onDone.resolve(undefined)
        })
        void promise.finally(() => didHide.dispose())

        const didAccept = this.quickpick.onDidAccept(() => {
            if (this.quickpick.selectedItems.length > this.maxSelectedRepoCount) {
                void vscode.window.showWarningMessage(
                    `You can only select up to ${this.maxSelectedRepoCount} repositories.`
                )
                return
            }
            onDone.resolve(this.quickpick.selectedItems.map(item => ({ name: item.name, id: item.id })))
            this.quickpick.hide()
        })
        void promise.finally(() => didAccept.dispose())

        // Show the quickpick
        this.quickpick.show()

        return promise
    }

    private handleRepoListChanged(): void {
        const selected = new Set<string>(this.quickpick.selectedItems.map(item => item.id))

        const workspaceRepos = new Set<string>(
            this.workspaceRepoMapper.workspaceRepos.map(item => item.id)
        )

        const selectedItems: (vscode.QuickPickItem & Repo)[] = []
        const workspaceItems: (vscode.QuickPickItem & Repo)[] = []
        const items: (vscode.QuickPickItem & Repo)[] = []

        const displayedRepos = new Set<string>()
        for (const repo of [...this.fetcher.repositories, ...this.prefetchedRepos.values()]) {
            if (displayedRepos.has(repo.id)) {
                // De-dup prefetched and fetcher repos.
                continue
            }
            displayedRepos.add(repo.id)

            const inWorkspace = workspaceRepos.has(repo.id)
            const shortName = repo.name.slice(repo.name.lastIndexOf('/') + 1)
            const item = {
                label: shortName,
                name: repo.name,
                id: repo.id,
                description: inWorkspace ? 'In your workspace' : '',
                detail: repo.name,
            }
            if (inWorkspace) {
                workspaceItems.push(item)
            } else {
                items.push(item)
            }
            if (selected.has(repo.id)) {
                selectedItems.push(item)
            }
        }

        this.quickpick.items = [
            {
                kind: vscode.QuickPickItemKind.Separator,
                label: 'Repositories in your workspace',
                name: 'SEPARATOR',
                id: 'SEPARATOR',
            },
            ...workspaceItems,
            {
                kind: vscode.QuickPickItemKind.Separator,
                label: 'Repositories from your Sourcegraph instance',
                name: 'SEPARATOR',
                id: 'SEPARATOR',
            },
            ...items,
        ]
        this.quickpick.selectedItems = selectedItems
    }
}
