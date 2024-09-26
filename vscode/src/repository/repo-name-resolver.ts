import type * as vscode from 'vscode'

import {
    ContextFiltersProvider,
    convertGitCloneURLToCodebaseName,
    currentAuthStatus,
    graphqlClient,
    isDefined,
    isDotCom,
} from '@sourcegraph/cody-shared'

import { logDebug } from '../log'
import { gitRemoteUrlsForUri } from './remote-urls-from-parent-dirs'

export class RepoNameResolver {
    /**
     * Get the names of repositories (such as `github.com/foo/bar`) that contain the given file URI.
     * The file URI can also be a folder within a workspace or a workspace root folder.
     *
     * ❗️ For enterprise, this uses the Sourcegraph API to resolve repo names instead of the local
     * conversion function. ❗️
     */
    public async getRepoNamesContainingUri(uri: vscode.Uri, signal?: AbortSignal): Promise<string[]> {
        try {
            const remoteUrls = (await gitRemoteUrlsForUri(uri, signal)) ?? []
            const uniqueRemoteUrls = Array.from(new Set(remoteUrls)).sort()

            // Use local conversion function for non-enterprise accounts.
            if (isDotCom(currentAuthStatus())) {
                return uniqueRemoteUrls.map(convertGitCloneURLToCodebaseName).filter(isDefined)
            }

            return (
                await Promise.all(
                    uniqueRemoteUrls.map(remoteUrl => graphqlClient.getRepoName(remoteUrl))
                )
            ).filter(isDefined)
        } catch (error) {
            logDebug('RepoNameResolver:getRepoNamesContainingUri', 'error', { verbose: error })
            return []
        }
    }
}

/**
 * A a singleton instance of the `RepoNameResolver` class.
 */
export const repoNameResolver = new RepoNameResolver()

ContextFiltersProvider.repoNameResolver = repoNameResolver
