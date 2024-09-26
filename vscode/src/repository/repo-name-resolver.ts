import type * as vscode from 'vscode'

import {
    ContextFiltersProvider,
    convertGitCloneURLToCodebaseName,
    currentAuthStatus,
    graphqlClient,
    isDefined,
    isDotCom,
    isFileURI,
} from '@sourcegraph/cody-shared'

import { logDebug } from '../log'
import { authProvider } from '../services/AuthProvider'

import { gitRemoteUrlsFromGitExtension } from './git-extension-api'
import { gitRemoteUrlsFromParentDirs } from './remote-urls-from-parent-dirs'

export class RepoNameResolver {
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

        try {
            const remoteUrls = await this.getRepoRemoteUrlsFromWorkspaceUri(uri, signal)

            if (remoteUrls.length !== 0) {
                const repoNames = await this.getRepoNamesFromRemoteUrls(remoteUrls)

                return repoNames
            }
        } catch (error) {
            logDebug('RepoNameResolver:getCodebaseFromWorkspaceUri', 'error', { verbose: error })
        }

        return []
    }

    private async getRepoRemoteUrlsFromWorkspaceUri(
        uri: vscode.Uri,
        signal?: AbortSignal
    ): Promise<string[]> {
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
                return graphqlClient.getRepoName(remoteUrl)
            })
        )

        return repoNames.filter(isDefined)
    }
}

/**
 * A a singleton instance of the `RepoNameResolver` class.
 */
export const repoNameResolver = new RepoNameResolver()

ContextFiltersProvider.repoNameResolver = repoNameResolver
