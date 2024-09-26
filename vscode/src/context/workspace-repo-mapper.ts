import { graphqlClient, isError, logDebug } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { repoNameResolver } from '../repository/repo-name-resolver'
import type { CodebaseRepoIdMapper } from './remote-repo'
import type { Repo } from './remote-repo'

const MAX_REPO_COUNT = 10

// Watches the VSCode workspace roots and maps any it finds to remote repository
// IDs. This depends on the vscode.git extension for mapping git repositories
// to their remotes.
export class WorkspaceRepoMapper implements CodebaseRepoIdMapper {
    // CodebaseRepoIdMapper implementation.
    public async repoForCodebase(repoName: string): Promise<Repo | undefined> {
        const repos = await this.findRepos(vscode.workspace.workspaceFolders ?? [])

        // Check workspace repository list.
        const item = repos.find(item => item.name === repoName)
        if (item) {
            return {
                id: item.id,
                name: item.name,
            }
        }

        const result = await graphqlClient.getRepoId(repoName)
        if (isError(result)) {
            throw result
        }
        return result
            ? {
                  name: repoName,
                  id: result,
              }
            : undefined
    }

    // Given a set of workspace folders, looks up their git remotes and finds the related repo IDs,
    // if any.
    private async findRepos(
        folders: readonly vscode.WorkspaceFolder[],
        signal?: AbortSignal
    ): Promise<Repo[]> {
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
            MAX_REPO_COUNT,
            signal
        )
        signal?.throwIfAborted()
        if (isError(repos)) {
            throw repos
        }

        return repos
    }
}
