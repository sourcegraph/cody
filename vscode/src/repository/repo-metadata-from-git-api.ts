import { subscriptionDisposable } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { WorkspaceRepoMapper } from '../context/workspace-repo-mapper'
import { logDebug } from '../log'
import { authProvider } from '../services/AuthProvider'
import { gitCommitIdFromGitExtension, vscodeGitAPI } from './git-extension-api'
import { repoNameResolver } from './repo-name-resolver'

export interface RepoRevMetaData extends GitHubDotComRepoMetaData {
    commit?: string
    remoteID?: string
}

class WorkspaceReposMonitor implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    private repoMetadata = new Map<string, Promise<RepoRevMetaData[]>>()

    private workspaceRepoMapper = new WorkspaceRepoMapper()

    constructor() {
        for (const folderURI of this.getFolderURIs()) {
            this.addWorkspaceFolder(folderURI)
        }
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(evt => this.onDidChangeWorkspaceFolders(evt))
        )

        this.disposables.push(
            subscriptionDisposable(
                authProvider.instance!.changes.subscribe(() => {
                    for (const folderURI of this.getFolderURIs()) {
                        this.addWorkspaceFolder(folderURI)
                    }
                })
            )
        )
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }

    public async getRepoMetadataIfPublic(): Promise<
        | { isPublic: false; repoMetadata: undefined }
        | { isPublic: true; repoMetadata: RepoRevMetaData[] }
    > {
        return _getRepoMetadataIfPublic(this.getFolderURIs(), this.repoMetadata)
    }

    public async getRepoMetadata(): Promise<RepoRevMetaData[]> {
        const folderURIs = this.getFolderURIs()
        const m: Promise<RepoRevMetaData[]>[] = []
        for (const folderURI of folderURIs) {
            const p = this.repoMetadata.get(folderURI.toString())
            if (p) {
                m.push(p)
            }
        }
        const repoMetadata = await Promise.all(m)
        return repoMetadata.flat()
    }

    private getFolderURIs(): vscode.Uri[] {
        return vscode.workspace.workspaceFolders?.map(f => f.uri) ?? []
    }

    private addWorkspaceFolder(folderURI: vscode.Uri): void {
        const repoMetadata: Promise<RepoRevMetaData[]> = fetchRepoMetadataForFolder(folderURI).then(
            metadatas =>
                Promise.all(
                    metadatas.map(async m => {
                        let remoteID = undefined
                        try {
                            remoteID = (await this.workspaceRepoMapper.repoForCodebase(m.repoName))?.id
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

        this.repoMetadata.set(folderURI.toString(), repoMetadata)
    }

    private removeWorkspaceFolder(folderURI: vscode.Uri): void {
        this.repoMetadata.delete(folderURI.toString())
    }

    private onDidChangeWorkspaceFolders(event: vscode.WorkspaceFoldersChangeEvent): void {
        for (const folder of event.added) {
            this.addWorkspaceFolder(folder.uri)
        }
        for (const folder of event.removed) {
            this.removeWorkspaceFolder(folder.uri)
        }
    }
}

export let workspaceReposMonitor: WorkspaceReposMonitor | undefined = undefined
export function initWorkspaceReposMonitor(
    disposables: vscode.Disposable[]
): WorkspaceReposMonitor | undefined {
    if (!vscodeGitAPI) {
        logDebug(
            'WorkspaceReposMonitor',
            'not initializing workspace repos monitor because the Git API is not available'
        )
        return undefined
    }
    workspaceReposMonitor = new WorkspaceReposMonitor()
    disposables.push(workspaceReposMonitor)
    return workspaceReposMonitor
}

async function fetchRepoMetadataForFolder(folderURI: vscode.Uri): Promise<GitHubDotComRepoMetaData[]> {
    const repoNames = await repoNameResolver.getRepoNamesFromWorkspaceUri(folderURI)
    if (repoNames.length === 0) {
        return []
    }

    const instance = GitHubDotComRepoMetadata.getInstance()
    return Promise.all(
        repoNames.map(async rn => {
            const metadata = await instance.getRepoMetadataUsingGitUrl(rn)
            return {
                repoName: rn,
                isPublic: rn === metadata?.repoName && metadata.isPublic,
            }
        })
    )
}

/**
 * Checks if all of the workspace folders correspond to a public repository.
 * A workspace folder is considered public if it has at least one public remote.
 * If all workspace folders are public, return the public repository metadata for each folder.
 */
export async function _getRepoMetadataIfPublic(
    folderURIs: vscode.Uri[],
    folderURIToRepoMetadata: Map<string, Promise<RepoRevMetaData[]>>
): Promise<
    { isPublic: false; repoMetadata: undefined } | { isPublic: true; repoMetadata: RepoRevMetaData[] }
> {
    try {
        if (folderURIs.length === 0) {
            return { isPublic: false, repoMetadata: undefined }
        }

        const m: (Promise<RepoRevMetaData[]> | undefined)[] = []
        for (const folderURI of folderURIs) {
            m.push(folderURIToRepoMetadata.get(folderURI.toString()))
        }
        const repoMetadata = await Promise.all(m)

        const allFoldersHaveAtLeastOnePublicRepo = repoMetadata.every(
            r => r?.some(r => r.isPublic) ?? false
        )
        if (!allFoldersHaveAtLeastOnePublicRepo) {
            return { isPublic: false, repoMetadata: undefined }
        }

        const publicRepoMetadata: RepoRevMetaData[] = []
        for (const r of repoMetadata) {
            if (!r) {
                continue
            }
            for (const m of r) {
                if (m.isPublic) {
                    publicRepoMetadata.push(m)
                    break
                }
            }
        }
        return {
            isPublic: true,
            repoMetadata: publicRepoMetadata,
        }
    } catch (error) {
        logDebug('_getRepoMetadataIfPublic', 'error getting repository metadata', error)
        return { isPublic: false, repoMetadata: undefined }
    }
}

interface GitHubDotComRepoMetaData {
    // The full uniquely identifying name on github.com, e.g., "github.com/sourcegraph/cody"
    repoName: string

    isPublic: boolean
}

export class GitHubDotComRepoMetadata {
    // This class is used to get the metadata from the gitApi.
    private static instance: GitHubDotComRepoMetadata | null = null
    private cache = new Map<string, GitHubDotComRepoMetaData | undefined>()

    private constructor() {}

    public static getInstance(): GitHubDotComRepoMetadata {
        if (!GitHubDotComRepoMetadata.instance) {
            GitHubDotComRepoMetadata.instance = new GitHubDotComRepoMetadata()
        }
        return GitHubDotComRepoMetadata.instance
    }

    public getRepoMetadataIfCached(gitUrl: string): GitHubDotComRepoMetaData | undefined {
        return this.cache.get(gitUrl)
    }

    public async getRepoMetadataUsingGitUrl(
        gitUrl: string
    ): Promise<GitHubDotComRepoMetaData | undefined> {
        if (this.cache.has(gitUrl)) {
            return this.cache.get(gitUrl)
        }
        const repoMetaData = await this.ghMetadataFromGit(gitUrl)
        if (repoMetaData) {
            this.cache.set(gitUrl, repoMetaData)
        }
        return repoMetaData
    }

    private async ghMetadataFromGit(gitUrl: string): Promise<GitHubDotComRepoMetaData | undefined> {
        const ownerAndRepoName = this.parseOwnerAndRepoName(gitUrl)
        if (!ownerAndRepoName) {
            return undefined
        }
        const repoMetaData = await this.queryGitHubApi(ownerAndRepoName.owner, ownerAndRepoName.repoName)
        return repoMetaData
    }

    private async queryGitHubApi(
        owner: string,
        repoName: string
    ): Promise<GitHubDotComRepoMetaData | undefined> {
        const apiUrl = `https://api.github.com/repos/${owner}/${repoName}`
        const metadata = { repoName: `github.com/${owner}/${repoName}`, isPublic: false }
        try {
            const response = await fetch(apiUrl, { method: 'HEAD' })
            metadata.isPublic = response.ok
        } catch (error) {
            logDebug(
                'queryGitHubApi',
                'error querying GitHub API (assuming repository is non-public',
                `${owner}/${repoName}`,
                error
            )
        }
        return metadata
    }

    private parseOwnerAndRepoName(gitUrl: string): { owner: string; repoName: string } | undefined {
        const match = gitUrl?.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
        if (!match) {
            return undefined
        }
        const [, owner, repoName] = match
        return { owner, repoName }
    }
}
