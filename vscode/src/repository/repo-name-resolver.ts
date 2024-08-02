import { LRUCache } from 'lru-cache'
import type * as vscode from 'vscode'

import {
    type RepoInfo,
    convertGitCloneURLToCodebaseName,
    graphqlClient,
    isDefined,
    isFileURI,
} from '@sourcegraph/cody-shared'

import { logDebug } from '../log'
import type { AuthProvider } from '../services/AuthProvider'

import { gitRemoteUrlsFromGitExtension } from './git-extension-api'
import { gitRemoteUrlsFromParentDirs } from './remote-urls-from-parent-dirs'

type RemoteUrl = string
type UriFsPath = string

export class RepoNameResolver {
    private authProvider: AuthProvider | undefined

    private fsPathToRepoInfoCache = new LRUCache<UriFsPath, RepoInfo[]>({ max: 1000 })
    private remoteUrlToRepoInfoCache = new LRUCache<RemoteUrl, Promise<RepoInfo | null>>({ max: 1000 })

    public init(authProvider: AuthProvider): void {
        this.authProvider = authProvider

        // TODO(beyang): handle disposable
        this.authProvider.onChange(
            () => {
                this.fsPathToRepoInfoCache.clear()
                this.remoteUrlToRepoInfoCache.clear()
            },
            { runImmediately: true }
        )
    }

    /**
     * Gets the repo infos for a file URI.
     *
     * ❗️ For enterprise accounts, uses Sourcegraph API to resolve repo names
     * instead of the local conversion function. ❗️
     *
     * Checks if the Git API is initialized, initializes it if not.
     * If found, gets repo infos from the repository.
     * if not found, walks the file system upwards until it finds a `.git` folder.
     */
    public getRepoInfosFromWorkspaceUri = async (
        uri: vscode.Uri,
        signal?: AbortSignal
    ): Promise<RepoInfo[]> => {
        if (!isFileURI(uri)) {
            return []
        }

        if (this.fsPathToRepoInfoCache.has(uri.fsPath)) {
            return this.fsPathToRepoInfoCache.get(uri.fsPath)!
        }

        try {
            const remoteUrls = await this.getRepoRemoteUrlsFromWorkspaceUri(uri, signal)

            if (remoteUrls.length !== 0) {
                const repoInfos = await this.getRepoNamesFromRemoteUrls(remoteUrls)
                this.fsPathToRepoInfoCache.set(uri.fsPath, repoInfos)

                return repoInfos
            }
        } catch (error) {
            logDebug('RepoNameResolver:getCodebaseFromWorkspaceUri', 'error', { verbose: error })
        }

        return []
    }

    public getRepoRemoteUrlsFromWorkspaceUri = async (
        uri: vscode.Uri,
        signal?: AbortSignal
    ): Promise<string[]> => {
        if (!isFileURI(uri)) {
            return []
        }

        try {
            let remoteUrls = gitRemoteUrlsFromGitExtension(uri)

            if (remoteUrls === undefined || remoteUrls.length === 0) {
                remoteUrls = await gitRemoteUrlsFromParentDirs(uri, signal)
            }

            return remoteUrls || []
        } catch (error) {
            logDebug('RepoNameResolver:getRepoRemoteUrlsFromWorkspaceUri', 'error', { verbose: error })
        }

        return []
    }

    private async getRepoNamesFromRemoteUrls(
        remoteUrls: string[],
        signal?: AbortSignal
    ): Promise<RepoInfo[]> {
        if (!this.authProvider) {
            throw new Error('RepoNameResolver not initialized')
        }

        const uniqueRemoteUrls = Array.from(new Set(remoteUrls))

        // Use local conversion function for non-enterprise accounts.
        if (this.authProvider.getAuthStatus().isDotCom) {
            return uniqueRemoteUrls
                .map(url => {
                    const name = convertGitCloneURLToCodebaseName(url)
                    return name ? ({ type: 'local', name } satisfies RepoInfo) : null
                })
                .filter(isDefined)
        }

        const repoNames = await Promise.all(
            uniqueRemoteUrls.map(remoteUrl => {
                return this.resolveRepoInfoForRemoteUrl(remoteUrl, signal)
            })
        )

        return repoNames.filter(isDefined)
    }

    private async resolveRepoInfoForRemoteUrl(
        remoteUrl: string,
        signal?: AbortSignal
    ): Promise<RepoInfo | null> {
        if (this.remoteUrlToRepoInfoCache.has(remoteUrl)) {
            return this.remoteUrlToRepoInfoCache.get(remoteUrl)!
        }

        const repoInfoRequest: Promise<RepoInfo | null> = graphqlClient
            .getRepoNameAndId(remoteUrl, signal)
            .then(data => (data ? { ...data, type: 'sourcegraph' } : null))
        this.remoteUrlToRepoInfoCache.set(remoteUrl, repoInfoRequest)

        return repoInfoRequest
    }
}

/**
 * A a singleton instance of the `RepoNameResolver` class.
 * `RepoNameResolver.init` is called on extension activation to set platform specific remote url getters.
 */
export const repoNameResolver = new RepoNameResolver()
