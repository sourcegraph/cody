import { LRUCache } from 'lru-cache'
import type * as vscode from 'vscode'

import {
    ContextFiltersProvider,
    type Unsubscribable,
    authStatus,
    combineLatest,
    convertGitCloneURLToCodebaseName,
    currentAuthStatus,
    debounceTime,
    graphqlClient,
    isDefined,
    isDotCom,
    isFileURI,
    resolvedConfig,
} from '@sourcegraph/cody-shared'

import { logDebug } from '../log'
import { authProvider } from '../services/AuthProvider'

import { gitRemoteUrlsFromGitExtension } from './git-extension-api'
import { gitRemoteUrlsFromParentDirs } from './remote-urls-from-parent-dirs'

type RepoName = string
type RemoteUrl = string
type UriFsPath = string

export class RepoNameResolver {
    private fsPathToRepoNameCache = new LRUCache<UriFsPath, RepoName[]>({ max: 1000 })
    private remoteUrlToRepoNameCache = new LRUCache<RemoteUrl, Promise<RepoName | null>>({ max: 1000 })

    private authStatusSubscription: Unsubscribable

    public constructor() {
        this.authStatusSubscription = combineLatest([authStatus, resolvedConfig])
            .pipe(debounceTime(0))
            .subscribe(() => {
                this.clearCache()
            })
    }

    public clearCache(): void {
        this.fsPathToRepoNameCache.clear()
        this.remoteUrlToRepoNameCache.clear()
    }

    /**
     * Gets the repo names for a file URI.
     *
     * ❗️ For enterprise accounts, uses Sourcegraph API to resolve repo names
     * instead of the local conversion function. ❗️
     *
     * Checks if the Git API is initialized, initializes it if not.
     * If found, gets repo names from the repository.
     * if not found, walks the file system upwards until it finds a `.git` folder.
     */
    public async getRepoNamesFromWorkspaceUri(uri: vscode.Uri, signal?: AbortSignal): Promise<string[]> {
        if (!isFileURI(uri)) {
            return []
        }

        if (this.fsPathToRepoNameCache.has(uri.fsPath)) {
            return this.fsPathToRepoNameCache.get(uri.fsPath)!
        }

        try {
            const remoteUrls = await this.getRepoRemoteUrlsFromWorkspaceUri(uri, signal)

            if (remoteUrls.length !== 0) {
                const repoNames = await this.getRepoNamesFromRemoteUrls(remoteUrls)
                this.fsPathToRepoNameCache.set(uri.fsPath, repoNames)

                return repoNames
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

    private async getRepoNamesFromRemoteUrls(remoteUrls: string[]): Promise<string[]> {
        if (!authProvider) {
            throw new Error('RepoNameResolver not initialized')
        }

        const uniqueRemoteUrls = Array.from(new Set(remoteUrls))

        // Use local conversion function for non-enterprise accounts.
        if (isDotCom(currentAuthStatus())) {
            return uniqueRemoteUrls.map(convertGitCloneURLToCodebaseName).filter(isDefined)
        }

        const repoNames = await Promise.all(
            uniqueRemoteUrls.map(remoteUrl => {
                return this.resolveRepoNameForRemoteUrl(remoteUrl)
            })
        )

        return repoNames.filter(isDefined)
    }

    private async resolveRepoNameForRemoteUrl(remoteUrl: string): Promise<string | null> {
        return graphqlClient.getRepoName(remoteUrl)
    }

    public dispose(): void {
        this.authStatusSubscription.unsubscribe()
    }
}

/**
 * A a singleton instance of the `RepoNameResolver` class.
 */
export const repoNameResolver = new RepoNameResolver()

ContextFiltersProvider.repoNameResolver = repoNameResolver
