import { LRUCache } from 'lru-cache'
import type * as vscode from 'vscode'

import {
    convertGitCloneURLToCodebaseName,
    graphqlClient,
    isDefined,
    isFileURI,
} from '@sourcegraph/cody-shared'

import { logDebug } from '../log'
import type { AuthProvider } from '../services/AuthProvider'

import { gitRemoteUrlsFromGitExtension } from './git-extension-api'
import { gitRemoteUrlsFromTreeWalk } from './remote-urls-from-tree-walk'

export type RemoteUrlGetter = (uri: vscode.Uri) => Promise<string[] | undefined>
type RepoName = string
type RemoteUrl = string
type UriFsPath = string

export class RepoNameResolver {
    private authProvider: AuthProvider | undefined

    private fsPathToRepoNameCache = new LRUCache<UriFsPath, RepoName[]>({ max: 1000 })
    private remoteUrlToRepoNameCache = new LRUCache<RemoteUrl, Promise<RepoName | null>>({ max: 1000 })

    public init(authProvider: AuthProvider): void {
        this.authProvider = authProvider

        this.authProvider.addChangeListener(() => {
            this.fsPathToRepoNameCache.clear()
            this.remoteUrlToRepoNameCache.clear()
        })
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
    public getRepoNamesFromWorkspaceUri = async (uri: vscode.Uri): Promise<string[]> => {
        if (!isFileURI(uri)) {
            return []
        }

        if (this.fsPathToRepoNameCache.has(uri.fsPath)) {
            return this.fsPathToRepoNameCache.get(uri.fsPath)!
        }

        try {
            const remoteUrls = await this.getRepoRemoteUrlsFromWorkspaceUri(uri)

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

    public getRepoRemoteUrlsFromWorkspaceUri = async (uri: vscode.Uri): Promise<string[]> => {
        if (!isFileURI(uri)) {
            return []
        }

        try {
            let remoteUrls = gitRemoteUrlsFromGitExtension(uri)

            if (remoteUrls === undefined || remoteUrls.length === 0) {
                remoteUrls = await gitRemoteUrlsFromTreeWalk(uri)
            }

            return remoteUrls || []
        } catch (error) {
            logDebug('RepoNameResolver:getRepoRemoteUrlsFromWorkspaceUri', 'error', { verbose: error })
        }

        return []
    }

    private async getRepoNamesFromRemoteUrls(remoteUrls: string[]): Promise<string[]> {
        if (!this.authProvider) {
            throw new Error('RepoNameResolver not initialized')
        }

        const uniqueRemoteUrls = Array.from(new Set(remoteUrls))

        // Use local conversion function for non-enterprise accounts.
        if (this.authProvider.getAuthStatus().isDotCom) {
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
        if (this.remoteUrlToRepoNameCache.has(remoteUrl)) {
            return this.remoteUrlToRepoNameCache.get(remoteUrl)!
        }

        const repoNameRequest = graphqlClient.getRepoName(remoteUrl)
        this.remoteUrlToRepoNameCache.set(remoteUrl, repoNameRequest)

        return repoNameRequest
    }
}

/**
 * A a singleton instance of the `RepoNameResolver` class.
 * `RepoNameResolver.init` is called on extension activation to set platform specific remote url getters.
 */
export const repoNameResolver = new RepoNameResolver()
