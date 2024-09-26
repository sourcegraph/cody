import * as vscode from 'vscode'
import { WorkspaceRepoMapper } from '../context/workspace-repo-mapper'
import { logDebug } from '../log'
import { gitCommitIdFromGitExtension } from './git-extension-api'
import { repoNameResolver } from './repo-name-resolver'

export interface RepoRevMetaData extends GitHubDotComRepoMetaData {
    commit?: string
    remoteID?: string
}

class WorkspaceReposMonitor {
    private workspaceRepoMapper = new WorkspaceRepoMapper()

    public async getRepoMetadata(): Promise<RepoRevMetaData[]> {
        const folderURIs = this.getFolderURIs()
        return (
            await Promise.all(folderURIs.map(folderURI => this.metadataForWorkspaceFolder(folderURI)))
        ).flat()
    }

    public getFolderURIs(): vscode.Uri[] {
        return vscode.workspace.workspaceFolders?.map(f => f.uri) ?? []
    }

    private async metadataForWorkspaceFolder(folderURI: vscode.Uri): Promise<RepoRevMetaData[]> {
        return fetchRepoMetadataForFolder(folderURI).then(metadatas =>
            Promise.all(
                metadatas.map(async m => {
                    let remoteID = undefined
                    try {
                        const repo = await this.workspaceRepoMapper.repoForCodebase(m.repoName)
                        remoteID = repo?.id
                    } catch (err) {
                        logDebug(
                            'WorkspaceReposMonitor',
                            'failed to find repo for codebase',
                            'repoName',
                            m.repoName,
                            'error',
                            err
                        )
                    }
                    return {
                        ...m,
                        commit: gitCommitIdFromGitExtension(folderURI),
                        remoteID,
                    }
                })
            )
        )
    }
}

export const workspaceReposMonitor = new WorkspaceReposMonitor()

export async function fetchRepoMetadataForFolder(
    folderURI: vscode.Uri
): Promise<GitHubDotComRepoMetaData[]> {
    const repoNames = await repoNameResolver.getRepoNamesContainingUri(folderURI)
    if (repoNames.length === 0) {
        return []
    }

    const instance = GitHubDotComRepoMetadata.getInstance()
    return Promise.all(
        repoNames.map(async rn => {
            const metadata = await instance.getRepoMetadataUsingRepoName(rn)
            return {
                repoName: rn,
                isPublic: rn === metadata?.repoName && metadata.isPublic,
            }
        })
    )
}

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
