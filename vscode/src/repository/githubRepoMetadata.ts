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
import { remoteReposForAllWorkspaceFolders } from './remoteRepos'

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
