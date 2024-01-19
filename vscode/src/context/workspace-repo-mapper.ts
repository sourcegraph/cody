import {
    type GraphQLAPIClientConfig,
    SourcegraphGraphQLAPIClient,
    isError,
    logDebug,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getCodebaseFromWorkspaceUri, gitAPI } from '../repository/repositoryHelpers'
import { RemoteSearch } from './remote-search'
import type { CodebaseRepoIdMapper } from './enterprise-context-factory'
import type { Repo } from './repo-fetcher'

// TODO(dpc): The vscode.git extension has an delay before we can fetch a
// workspace folder's remote. Switch to cody-engine instead of depending on
// vscode.git and this arbitrary delay.
const GIT_REFRESH_DELAY = 2000

// Watches the VSCode workspace roots and maps any it finds to remote repository
// IDs. This depends on the vscode.git extension for mapping git repositories
// to their remotes.
export class WorkspaceRepoMapper implements vscode.Disposable, CodebaseRepoIdMapper {
    private readonly client: SourcegraphGraphQLAPIClient
    private changeEmitter = new vscode.EventEmitter<{ name: string; id: string }[]>()
    private disposables: vscode.Disposable[] = [this.changeEmitter]
    private repos: { name: string; id: string }[] = []
    private started: Promise<void> | undefined

    constructor(config: GraphQLAPIClientConfig) {
        this.client = new SourcegraphGraphQLAPIClient(config)
    }

    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
        this.disposables = []
    }

    public updateConfiguration(config: GraphQLAPIClientConfig): void {
        this.client.onConfigurationChange(config)
        if (this.started) {
            this.started.then(() => this.updateRepos())
        }
    }

    // CodebaseRepoIdMapper implementation.
    public async repoForCodebase(repoName: string): Promise<Repo | undefined> {
        if (!repoName) {
            return
        }
        // Check cached repository list.
        const item = this.repos.find(item => item.name === repoName)
        if (item) {
            return {
                id: item.id,
                name: item.name,
            }
        }
        const result = await this.client.getRepoId(repoName)
        if (isError(result)) {
            throw result
        }
        if (!result) {
            return
        }
        return {
            name: repoName,
            id: result,
        }
    }

    // Fetches the set of repo IDs and starts listening for workspace changes.
    // After this Promise resolves, `workspaceRepoIds` contains the set of
    // repo IDs for the workspace (if any.)
    public async start(): Promise<void> {
        // If are already starting/started, then join that.
        if (this.started) {
            return this.started
        }

        this.started = (async () => {
            try {
                await this.updateRepos()
            } catch (error) {
                // Reset the started property so the next call to start will try again.
                this.started = undefined
                throw error
            }
            vscode.workspace.onDidChangeWorkspaceFolders(
                async () => {
                    logDebug('WorkspaceRepoMapper', 'Workspace folders changed, updating repos')
                    setTimeout(async () => await this.updateRepos(), GIT_REFRESH_DELAY)
                },
                undefined,
                this.disposables
            )
            gitAPI()?.onDidOpenRepository(
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

    public get workspaceRepos(): { name: string; id: string }[] {
        return [...this.repos]
    }

    public get onChange(): vscode.Event<{ name: string; id: string }[]> {
        return this.changeEmitter.event
    }

    // Updates the `workspaceRepos` property and fires the change event.
    private async updateRepos(): Promise<void> {
        try {
            const folders = vscode.workspace.workspaceFolders || []
            logDebug(
                'WorkspaceRepoMapper',
                `Mapping ${folders.length} workspace folders to repos: ${folders
                    .map(f => f.uri.toString())
                    .join()}`
            )
            this.repos = await this.findRepoIds(folders)
        } catch (error) {
            logDebug('WorkspaceRepoMapper', `Error mapping workspace folders to repo IDs: ${error}`)
            throw error
        }
        this.changeEmitter.fire(this.workspaceRepos)
    }

    // Given a set of workspace folders, looks up their git remotes and finds the related repo IDs,
    // if any.
    private async findRepoIds(
        folders: readonly vscode.WorkspaceFolder[]
    ): Promise<{ name: string; id: string }[]> {
        const repoNames = new Set(
            folders.flatMap(folder => {
                const codebase = getCodebaseFromWorkspaceUri(folder.uri)
                return codebase ? [codebase] : []
            })
        )
        if (repoNames.size === 0) {
            // Otherwise we fetch the first 10 repos from the Sourcegraph instance
            return []
        }
        const ids = await this.client.getRepoIds([...repoNames.values()], RemoteSearch.MAX_REPO_COUNT)
        if (isError(ids)) {
            throw ids
        }
        return ids
    }
}
