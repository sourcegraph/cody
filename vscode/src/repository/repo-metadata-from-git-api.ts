import * as vscode from 'vscode'
import { logDebug } from '../log'
import { gitCommitIdFromGitExtension, vscodeGitAPI } from './git-extension-api'
import { repoNameResolver } from './repo-name-resolver'

export interface RepoRevMetaData extends RepoMetaData {
    commit?: string
}

export class WorkspaceReposMonitor implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private repoMetadata = new Map<string, Promise<RepoRevMetaData[]>>()

    constructor() {
        for (const folderURI of this.getFolderURIs()) {
            this.addWorkspaceFolder(folderURI)
        }
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(evt => this.onDidChangeWorkspaceFolders(evt))
        )
    }

    private getFolderURIs(): vscode.Uri[] {
        return vscode.workspace.workspaceFolders?.map(f => f.uri) ?? []
    }

    private addWorkspaceFolder(folderURI: vscode.Uri): void {
        const repoMetadata: Promise<RepoRevMetaData[]> = fetchRepoMetadataForFolder(folderURI).then(
            metadatas =>
                metadatas.map(m => ({
                    ...m,
                    commit: gitCommitIdFromGitExtension(folderURI),
                }))
        )
        this.repoMetadata.set(folderURI.toString(), repoMetadata)
    }

    private removeWorkspaceFolder(folderURI: vscode.Uri): void {
        this.repoMetadata.delete(folderURI.toString())
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

async function fetchRepoMetadataForFolder(folderURI: vscode.Uri): Promise<RepoMetaData[]> {
    const repoNames = await repoNameResolver.getRepoNamesFromWorkspaceUri(folderURI)
    if (repoNames.length === 0) {
        return []
    }
    const instance = RepoMetadatafromGitApi.getInstance()
    return Promise.all(repoNames.map(rn => instance.getRepoMetadataUsingGitUrl(rn))).then(metadatas =>
        metadatas.filter(m => m).map(m => m as RepoMetaData)
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

interface RepoMetaData {
    owner: string
    repoName: string
    isPublic: boolean
}

export class RepoMetadatafromGitApi {
    // This class is used to get the metadata from the gitApi.
    private static instance: RepoMetadatafromGitApi | null = null
    private cache = new Map<string, RepoMetaData | undefined>()

    private constructor() {}

    public static getInstance(): RepoMetadatafromGitApi {
        if (!RepoMetadatafromGitApi.instance) {
            RepoMetadatafromGitApi.instance = new RepoMetadatafromGitApi()
        }
        return RepoMetadatafromGitApi.instance
    }

    public getRepoMetadataIfCached(gitUrl: string): RepoMetaData | undefined {
        return this.cache.get(gitUrl)
    }

    public async getRepoMetadataUsingGitUrl(gitUrl: string): Promise<RepoMetaData | undefined> {
        if (this.cache.has(gitUrl)) {
            return this.cache.get(gitUrl)
        }
        const repoMetaData = await this.metadataFromGit(gitUrl)
        if (repoMetaData) {
            this.cache.set(gitUrl, repoMetaData)
        }
        return repoMetaData
    }

    private async metadataFromGit(gitUrl: string): Promise<RepoMetaData | undefined> {
        const ownerAndRepoName = this.parserOwnerAndRepoName(gitUrl)
        if (!ownerAndRepoName) {
            return undefined
        }
        const repoMetaData = await this.queryGitHubApi(ownerAndRepoName.owner, ownerAndRepoName.repoName)
        return repoMetaData
    }

    private async queryGitHubApi(owner: string, repoName: string): Promise<RepoMetaData | undefined> {
        const apiUrl = `https://api.github.com/repos/${owner}/${repoName}`
        const metadata = { owner, repoName, isPublic: false }
        try {
            const response = await fetch(apiUrl, { method: 'HEAD' })
            metadata.isPublic = response.ok
        } catch (error) {
            console.error('Error fetching repository metadata:', error)
        }
        return metadata
    }

    private parserOwnerAndRepoName(gitUrl: string): { owner: string; repoName: string } | undefined {
        const match = gitUrl?.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
        if (!match) {
            return undefined
        }
        const [, owner, repoName] = match
        return { owner, repoName }
    }
}
