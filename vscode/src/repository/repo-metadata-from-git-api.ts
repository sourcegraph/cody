import * as vscode from 'vscode'
import { type RemoteRepo, WorkspaceRepoMapper } from '../context/workspace-repo-mapper'
import { logDebug } from '../log'
import { repoNameResolver } from './repo-name-resolver'

/**
 * A {@link RemoteRepo} where the `id` is optional.
 */
interface MaybeRemoteRepo extends Pick<RemoteRepo, 'name'>, Partial<Pick<RemoteRepo, 'id'>> {}

class WorkspaceReposMonitor {
    private workspaceRepoMapper = new WorkspaceRepoMapper()

    public async getRepoMetadataForAllWorkspaceFolders(): Promise<MaybeRemoteRepo[]> {
        return (
            await Promise.all(
                vscode.workspace.workspaceFolders?.map(folder =>
                    repoNameResolver.getRepoNamesContainingUri(folder.uri).then(repoNames =>
                        Promise.all(
                            repoNames.map(async (repoName): Promise<MaybeRemoteRepo> => {
                                try {
                                    const remoteRepo =
                                        await this.workspaceRepoMapper.repoForCodebase(repoName)
                                    if (remoteRepo) {
                                        return remoteRepo
                                    }
                                } catch (error) {
                                    logDebug(
                                        'WorkspaceReposMonitor',
                                        'failed to find repo ID for repoName',
                                        repoName,
                                        'error',
                                        error
                                    )
                                }
                                return { name: repoName }
                            })
                        )
                    )
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
