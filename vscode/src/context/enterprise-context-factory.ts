import type * as vscode from 'vscode'
import { SourcegraphGraphQLAPIClient, type GraphQLAPIClientConfig } from '@sourcegraph/cody-shared'
import { RemoteRepoPicker } from './repo-picker'
import { RemoteSearch } from './remote-search'
import { WorkspaceRepoMapper } from './workspace-repo-mapper'
import { type Repo, RepoFetcher } from './repo-fetcher'

export class EnterpriseContextFactory implements vscode.Disposable {
    // Only one RemoteRepoPicker can be displayed at once, so we share one
    // instance.
    public readonly repoPicker: RemoteRepoPicker
    private readonly fetcher: RepoFetcher
    private readonly workspaceRepoMapper: WorkspaceRepoMapper
    private config: GraphQLAPIClientConfig

    constructor(config: GraphQLAPIClientConfig) {
        this.config = config
        this.workspaceRepoMapper = new WorkspaceRepoMapper(config)
        this.fetcher = new RepoFetcher(new SourcegraphGraphQLAPIClient(config))
        this.workspaceRepoMapper = new WorkspaceRepoMapper(config)
        this.repoPicker = new RemoteRepoPicker(this.fetcher, this.workspaceRepoMapper)
    }

    public dispose(): void {
        this.fetcher.dispose()
        this.repoPicker.dispose()
        this.workspaceRepoMapper.dispose()
    }

    public updateConfiguration(config: GraphQLAPIClientConfig): void {
        this.config = config
        this.fetcher.updateConfiguration(config)
        this.workspaceRepoMapper.updateConfiguration(config)
    }

    // Creates a new RemoteSearch proxy. The RemoteSearch is stateful because
    // it maintains a set of selected repositories to search, so each chat panel
    // should use a separate instance. The returned RemoteSearch does not get
    // configuration updates; this is fine for the SimpleChatPanelProvider
    // client because chats are restarted if the configuration changes.
    public createRemoteSearch(): RemoteSearch {
        return new RemoteSearch(new SourcegraphGraphQLAPIClient(this.config))
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
