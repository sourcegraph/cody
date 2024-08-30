import type {
    ResolvedConfiguration,
    SourcegraphCompletionsClient,
    Unsubscribable,
} from '@sourcegraph/cody-shared'
import type { Observable } from 'observable-fns'
import type * as vscode from 'vscode'
import { RemoteRepoSearcher } from './remote-repo-searcher'
import { RemoteSearch } from './remote-search'
import { type Repo, RepoFetcher } from './repo-fetcher'
import { RemoteRepoPicker } from './repo-picker'
import { WorkspaceRepoMapper } from './workspace-repo-mapper'

export class EnterpriseContextFactory implements vscode.Disposable {
    // Only one RemoteRepoPicker can be displayed at once, so we share one
    // instance.
    public readonly repoPicker: RemoteRepoPicker
    public readonly repoSearcher: RemoteRepoSearcher
    private readonly fetcher: RepoFetcher
    private readonly workspaceRepoMapper: WorkspaceRepoMapper

    private configSubscription: Unsubscribable

    constructor(
        private completions: SourcegraphCompletionsClient,
        config: Observable<ResolvedConfiguration>
    ) {
        this.fetcher = new RepoFetcher()
        this.workspaceRepoMapper = new WorkspaceRepoMapper()
        this.repoPicker = new RemoteRepoPicker(this.fetcher, this.workspaceRepoMapper)
        this.repoSearcher = new RemoteRepoSearcher(this.fetcher)

        this.configSubscription = config.subscribe(config => {
            this.fetcher.clientConfigurationDidChange()
            this.workspaceRepoMapper.clientConfigurationDidChange()
        })
    }

    public dispose(): void {
        this.fetcher.dispose()
        this.repoPicker.dispose()
        this.repoSearcher.dispose()
        this.workspaceRepoMapper.dispose()
        this.configSubscription.unsubscribe()
    }

    // Creates a new RemoteSearch proxy. The RemoteSearch is stateful because
    // it maintains a set of selected repositories to search, so each chat panel
    // should use a separate instance. The returned RemoteSearch does not get
    // configuration updates; this is fine for the ChatController
    // client because chats are restarted if the configuration changes.
    public createRemoteSearch(): RemoteSearch {
        return new RemoteSearch(this.completions)
    }

    // Gets an object that can map codebase repo names into repository IDs on
    // the Sourcegraph remote.
    public getCodebaseRepoIdMapper(): CodebaseRepoIdMapper {
        return this.workspaceRepoMapper
    }
}

// Maps a codebase name to a repo ID on the Sourcegraph remote, or undefined if
// there is none.
export interface CodebaseRepoIdMapper {
    repoForCodebase(codebase: string): Promise<Repo | undefined>
}
