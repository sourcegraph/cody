import {
    type GraphQLAPIClientConfig,
    SourcegraphGraphQLAPIClient,
    logDebug,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

export interface Repo {
    name: string
    id: string
}

export enum RepoFetcherState {
    Paused = 0,
    Fetching = 1,
    Errored = 2,
    Complete = 3,
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

    // The cursor at the end of the last fetched repositories.
    private after: string | undefined
    private repos: Repo[] = []

    constructor(private client: SourcegraphGraphQLAPIClient) {}

    public dispose(): void {
        this.repoListChangedEmitter.dispose()
        this.stateChangedEmitter.dispose()
    }

    public get lastError(): Error | undefined {
        return this.error_
    }

    public updateConfiguration(config: GraphQLAPIClientConfig): void {
        this.client = new SourcegraphGraphQLAPIClient(config)
        this.repos = []
        this.after = undefined
        this.state = RepoFetcherState.Paused
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
        // DONOTCOMMIT: Increase this and remove the timeout.
        const numResultsPerQuery = 100
        const client = this.client
        if (this.state === RepoFetcherState.Paused) {
            return
        }
        do {
            const result = await client.getRepoList(numResultsPerQuery, this.after)
            if (this.client !== client) {
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

            // DONOTCOMMIT remove this artificial delay
            await new Promise(resolve => setTimeout(resolve, 3000))
        } while (this.state === RepoFetcherState.Fetching && this.after)

        if (!this.after) {
            this.state = RepoFetcherState.Complete
        }
    }
}
