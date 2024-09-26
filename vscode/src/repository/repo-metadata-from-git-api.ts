import { graphqlClient, isError } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { logDebug } from '../log'
import { repoNameResolver } from './repo-name-resolver'

interface RemoteRepo {
    /** The name of the repository (e.g., `github.com/foo/bar`). */
    name: string

    /** The GraphQL ID of the repository on the Sourcegraph instance. */
    id: string
}

/**
 * A {@link RemoteRepo} where the `id` is optional.
 */
interface MaybeRemoteRepo extends Pick<RemoteRepo, 'name'>, Partial<Pick<RemoteRepo, 'id'>> {}

const MAX_REPO_COUNT = 10

class WorkspaceReposMonitor {
    public async getRepoMetadataForAllWorkspaceFolders(
        signal?: AbortSignal
    ): Promise<MaybeRemoteRepo[]> {
        return (
            await Promise.all(
                vscode.workspace.workspaceFolders?.map(folder =>
                    repoNameResolver
                        .getRepoNamesContainingUri(folder.uri)
                        .then(async (repoNames): Promise<MaybeRemoteRepo[]> => {
                            const reposOrError = await graphqlClient.getRepoIds(
                                repoNames,
                                MAX_REPO_COUNT,
                                signal
                            )
                            if (isError(reposOrError)) {
                                throw reposOrError
                            }
                            return reposOrError
                        })
                ) ?? []
            )
        ).flat()
    }
}

export const workspaceReposMonitor = new WorkspaceReposMonitor()

interface GitHubDotComRepoMetaData {
    // The full uniquely identifying name on github.com, e.g., "github.com/sourcegraph/cody"
    repoName: string

    isPublic: boolean
}

export class GitHubDotComRepoMetadata {
    // This class is used to get the metadata from the gitApi.
    private static instance: GitHubDotComRepoMetadata | null = null
    private cache = new Map<string /* repoName */, GitHubDotComRepoMetaData | undefined>()

    private constructor() {}

    public static getInstance(): GitHubDotComRepoMetadata {
        if (!GitHubDotComRepoMetadata.instance) {
            GitHubDotComRepoMetadata.instance = new GitHubDotComRepoMetadata()
        }
        return GitHubDotComRepoMetadata.instance
    }

    public getRepoMetadataIfCached(repoName: string): GitHubDotComRepoMetaData | undefined {
        return this.cache.get(repoName)
    }

    public async getRepoMetadataUsingRepoName(
        repoName: string
    ): Promise<GitHubDotComRepoMetaData | undefined> {
        if (this.cache.has(repoName)) {
            return this.cache.get(repoName)
        }
        const repoMetaData = await this.ghMetadataFromGit(repoName)
        if (repoMetaData) {
            this.cache.set(repoName, repoMetaData)
        }
        return repoMetaData
    }

    private async ghMetadataFromGit(repoName: string): Promise<GitHubDotComRepoMetaData | undefined> {
        const ownerAndRepoName = this.parseOwnerAndRepoName(repoName)
        if (!ownerAndRepoName) {
            return undefined
        }
        const repoMetaData = await this.queryGitHubApi(ownerAndRepoName.owner, ownerAndRepoName.repoName)
        return repoMetaData
    }

    private async queryGitHubApi(
        owner: string,
        repoBasename: string
    ): Promise<GitHubDotComRepoMetaData | undefined> {
        const apiUrl = `https://api.github.com/repos/${owner}/${repoBasename}`
        const metadata = { repoName: `github.com/${owner}/${repoBasename}`, isPublic: false }
        try {
            const response = await fetch(apiUrl, { method: 'HEAD' })
            metadata.isPublic = response.ok
        } catch (error) {
            logDebug(
                'queryGitHubApi',
                'error querying GitHub API (assuming repository is non-public',
                `${owner}/${repoBasename}`,
                error
            )
        }
        return metadata
    }

    private parseOwnerAndRepoName(repoName: string): { owner: string; repoName: string } | undefined {
        const match = repoName?.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
        if (!match) {
            return undefined
        }
        const [, owner, repoBasename] = match
        return { owner, repoName: repoBasename }
    }
}
