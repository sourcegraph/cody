import { graphqlClient, logDebug } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

export interface Repo {
    name: string
    id: string
}

export enum RepoFetcherState {
    Paused = 'paused',
    Fetching = 'fetching',
    Errored = 'errored',
    Complete = 'complete',
}

// RepoFetcher
// - Fetches repositories from a Sourcegraph instance.
// - Fetching can be paused and restarted.
// - Notifies a listener when the set of repositories has changed.
export class RepoFetcher implements vscode.Disposable {
    private state_: RepoFetcherState = RepoFetcherState.Paused
    private readonly stateChangedEmitter = new vscode.EventEmitter<RepoFetcherState>()
    public readonly onStateChanged = this.stateChangedEmitter.event

    private readonly repoListChangedEmitter = new vscode.EventEmitter<Repo[]>()
    public readonly onRepoListChanged = this.repoListChangedEmitter.event

    private error_: Error | undefined
    private configurationEpoch = 0

    // The cursor at the end of the last fetched repositories.
    private after: string | undefined
    private repos: Repo[] = []

    public dispose(): void {
        this.repoListChangedEmitter.dispose()
        this.stateChangedEmitter.dispose()
    }

    public get lastError(): Error | undefined {
        return this.error_
    }

    public clientConfigurationDidChange(): void {
        this.repos = []
        this.after = undefined
        this.state = RepoFetcherState.Paused
        this.configurationEpoch++
    }

    public pause(): void {
        this.state = RepoFetcherState.Paused
    }

    public resume(): void {
        this.state = RepoFetcherState.Fetching
        void this.fetch()
    }

    // Gets the known repositories. The set may be incomplete if fetching hasn't
    // finished, the cache is stale, etc.
    public get repositories(): readonly Repo[] {
        return this.repos
    }

    public get state(): RepoFetcherState {
        return this.state_
    }

    private set state(newState: RepoFetcherState) {
        if (this.state === newState) {
            return
        }
        this.state_ = newState
        this.stateChangedEmitter.fire(newState)
    }

    private async fetch(): Promise<void> {
        const numResultsPerQuery = 10_000
        const configurationEpoch = this.configurationEpoch
        if (this.state === RepoFetcherState.Paused) {
            return
        }
        do {
            const result = await graphqlClient.getRepoList(numResultsPerQuery, this.after)
            if (this.configurationEpoch !== configurationEpoch) {
                // The configuration changed during this fetch, so stop.
                return
            }
            if (result instanceof Error) {
                this.state = RepoFetcherState.Errored
                this.error_ = result
                logDebug('RepoFetcher', result.toString())
                return
            }
            const newRepos = result.repositories.nodes
            this.repos.push(...newRepos)
            this.repoListChangedEmitter.fire(this.repos)
            this.after = result.repositories.pageInfo.endCursor || undefined
        } while (this.state === RepoFetcherState.Fetching && this.after)

        if (!this.after) {
            this.state = RepoFetcherState.Complete
        }
    }
}
