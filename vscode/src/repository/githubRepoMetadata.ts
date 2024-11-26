import {
    catchError,
    combineLatest,
    isAbortError,
    isDefined,
    isError,
    pendingOperation,
    promiseFactoryToObservable,
    switchMap,
} from '@sourcegraph/cody-shared'
import { Observable, map } from 'observable-fns'
import { logDebug } from '../output-channel-logger'
import { localStorage } from '../services/LocalStorageProvider'
import { remoteReposForAllWorkspaceFolders } from './remoteRepos'

export interface RepoAccessibilityData {
    repoName: string
    isPublic: boolean
}

interface GitHubDotComRepoMetaData {
    // The full uniquely identifying name on github.com, e.g., "github.com/sourcegraph/cody"
    repoName: string
    isPublic: boolean
}

const DEFAULT_MIN_LOCAL_STORAGE_UPDATE_TIME_MS = 1000 * 60 * 10 // 10 minutes

export class GitHubDotComRepoMetadata {
    // This class is used to get the metadata from the gitApi.
    private static instance: GitHubDotComRepoMetadata | null = null
    // Store a copy of the latest local storage data for comparison with the current cache.
    private lastLocalStorageData: RepoAccessibilityData[] = []
    // Last time when the local storage was updated.
    private lastLocalStorageUpdateTime: number | null = null
    // Since the local storage update can be expansive, we add a minimum time between updates.
    private readonly minLocalStorageUpdateTimeMs: number

    private cache = new Map<string /* repoName */, GitHubDotComRepoMetaData | undefined>()

    private constructor(minLocalStorageUpdateTimeMs: number) {
        this.minLocalStorageUpdateTimeMs = minLocalStorageUpdateTimeMs
        this.populateCacheFromLocalStorage()
    }

    public populateCacheFromLocalStorage(): void {
        this.cache.clear()
        this.lastLocalStorageData = localStorage.getGitHubRepoAccessibility()
        for (const data of this.lastLocalStorageData) {
            this.cache.set(data.repoName, data)
        }
    }

    public static getInstance(
        params = { minLocalStorageUpdateTimeMs: DEFAULT_MIN_LOCAL_STORAGE_UPDATE_TIME_MS }
    ): GitHubDotComRepoMetadata {
        if (!GitHubDotComRepoMetadata.instance) {
            GitHubDotComRepoMetadata.instance = new GitHubDotComRepoMetadata(
                params.minLocalStorageUpdateTimeMs
            )
        }
        return GitHubDotComRepoMetadata.instance
    }

    public getRepoMetadataIfCached(repoBaseName: string): GitHubDotComRepoMetaData | undefined {
        const normalizedRepoName = this.getNormalizedRepoNameFromBaseRepoName(repoBaseName)
        if (!normalizedRepoName) {
            return undefined
        }
        return this.cache.get(normalizedRepoName)
    }

    public async getRepoMetadataUsingRepoName(
        repoBaseName: string,
        signal?: AbortSignal
    ): Promise<GitHubDotComRepoMetaData | undefined> {
        const repoMetadata = this.getRepoMetadataIfCached(repoBaseName)
        if (repoMetadata) {
            return repoMetadata
        }
        const repoMetaData = await this.ghMetadataFromGit(repoBaseName, signal)
        if (repoMetaData) {
            this.cache.set(repoMetaData.repoName, repoMetaData)
            this.updateCachedDataToLocalStorageIfNeeded()
        }
        return repoMetaData
    }

    private async ghMetadataFromGit(
        repoBaseName: string,
        signal?: AbortSignal
    ): Promise<GitHubDotComRepoMetaData | undefined> {
        const ownerAndRepoName = this.parseOwnerAndRepoName(repoBaseName)
        if (!ownerAndRepoName) {
            return undefined
        }
        const repoMetaData = await this.queryGitHubApi(
            ownerAndRepoName.owner,
            ownerAndRepoName.repoName,
            signal
        )
        return repoMetaData
    }

    private async queryGitHubApi(
        owner: string,
        repoName: string,
        signal?: AbortSignal
    ): Promise<GitHubDotComRepoMetaData | undefined> {
        const apiUrl = `https://api.github.com/repos/${owner}/${repoName}`
        const normalizedRepoName = this.getNormalizedRepoNameFromOwnerAndRepoName(owner, repoName)
        const metadata = { repoName: normalizedRepoName, isPublic: false }
        try {
            const response = await fetch(apiUrl, { method: 'HEAD', signal })
            metadata.isPublic = response.ok
        } catch (error) {
            if (!isAbortError(error)) {
                logDebug(
                    'queryGitHubApi',
                    'error querying GitHub API (assuming repository is non-public',
                    `${owner}/${repoName}`,
                    error
                )
            }
        }
        return metadata
    }

    private getNormalizedRepoNameFromBaseRepoName(repoBaseName: string): string | undefined {
        const ownerAndRepoName = this.parseOwnerAndRepoName(repoBaseName)
        if (!ownerAndRepoName) {
            return undefined
        }
        return this.getNormalizedRepoNameFromOwnerAndRepoName(
            ownerAndRepoName.owner,
            ownerAndRepoName.repoName
        )
    }

    private getNormalizedRepoNameFromOwnerAndRepoName(owner: string, repoName: string): string {
        return `github.com/${owner}/${repoName}`
    }

    private parseOwnerAndRepoName(
        repoBaseName: string
    ): { owner: string; repoName: string } | undefined {
        const match = repoBaseName?.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
        if (!match) {
            return undefined
        }
        const [, owner, repoName] = match
        return { owner, repoName: repoName }
    }

    public updateCachedDataToLocalStorageIfNeeded(): void {
        const repoAccessibilityData: RepoAccessibilityData[] = []
        for (const [repoName, repoMetadata] of this.cache) {
            if (repoMetadata) {
                repoAccessibilityData.push({ repoName, isPublic: repoMetadata.isPublic })
            }
        }
        if (this.shouldUpdateCachedDataToLocalStorage(repoAccessibilityData)) {
            // Updates the updated cache values to local storage
            this.lastLocalStorageData = repoAccessibilityData
            this.lastLocalStorageUpdateTime = Date.now()
            localStorage.setGitHubRepoAccessibility(repoAccessibilityData)
        }
    }

    public shouldUpdateCachedDataToLocalStorage(
        repoAccessibilityData: RepoAccessibilityData[]
    ): boolean {
        if (
            this.lastLocalStorageUpdateTime !== null &&
            Date.now() - this.lastLocalStorageUpdateTime < this.minLocalStorageUpdateTimeMs
        ) {
            return false
        }

        if (repoAccessibilityData.length !== this.lastLocalStorageData.length) {
            return true
        }
        const latestRepoMap = new Map(
            this.lastLocalStorageData.map(repo => [repo.repoName, repo.isPublic])
        )
        for (const { repoName, isPublic } of repoAccessibilityData) {
            if (latestRepoMap.get(repoName) !== isPublic) {
                return true
            }
        }
        return false
    }
}

export interface RepoRevMetaData extends GitHubDotComRepoMetaData {
    commit?: string
    remoteID?: string
}

type PublicRepoMetadata =
    | { isPublic: false; repoMetadata: undefined }
    | { isPublic: true; repoMetadata: RepoRevMetaData[] }

const NO_PUBLIC_METADATA: PublicRepoMetadata = { isPublic: false, repoMetadata: undefined }

/**
 * Checks if all of the workspace folders correspond to a public repository.
 * A workspace folder is considered public if it has at least one public remote.
 * If all workspace folders are public, return the public repository metadata for each workspace folder.
 */
export const publicRepoMetadataIfAllWorkspaceReposArePublic: Observable<
    PublicRepoMetadata | typeof pendingOperation
> = remoteReposForAllWorkspaceFolders.pipe(
    map(remoteRepos => (isError(remoteRepos) ? [] : remoteRepos)),
    switchMap((remoteRepos): Observable<PublicRepoMetadata | typeof pendingOperation> => {
        if (remoteRepos === pendingOperation) {
            return Observable.of(pendingOperation)
        }
        if (remoteRepos.length === 0) {
            return Observable.of(NO_PUBLIC_METADATA)
        }
        return combineLatest(
            ...remoteRepos.map(remoteRepo =>
                promiseFactoryToObservable(signal =>
                    // This is cached, so it's fast.
                    GitHubDotComRepoMetadata.getInstance().getRepoMetadataUsingRepoName(
                        remoteRepo.name,
                        signal
                    )
                )
            )
        ).pipe(
            map(repoMetadatas => {
                const allReposArePublic =
                    repoMetadatas.length >= 1 &&
                    repoMetadatas.every(repoMetadata => repoMetadata?.isPublic ?? false)
                return allReposArePublic
                    ? { isPublic: true as const, repoMetadata: repoMetadatas.filter(isDefined) }
                    : NO_PUBLIC_METADATA
            }),
            catchError(error => {
                logDebug(
                    'publicRepoMetadataIfAllWorkspaceReposArePublic',
                    'error getting repository metadata',
                    error
                )
                return Observable.of(NO_PUBLIC_METADATA)
            })
        )
    })
)
