import { LRUCache } from 'lru-cache'
import { Observable, map } from 'observable-fns'
import type * as vscode from 'vscode'

import {
    ContextFiltersProvider,
    type MaybePendingObservable,
    authStatus,
    combineLatest,
    convertGitCloneURLToCodebaseName,
    distinctUntilChanged,
    firstResultFromOperation,
    graphqlClient,
    isDefined,
    isDotCom,
    isError,
    logError,
    pendingOperation,
    pluck,
    promiseFactoryToObservable,
    resolvedConfig,
    switchMapReplayOperation,
} from '@sourcegraph/cody-shared'

import { logDebug } from '../output-channel-logger'

import { type GitRemoteUrlsInfo, gitRemoteUrlsInfoForUri } from './remote-urls-from-parent-dirs'

type RemoteUrl = string
type RepoName = string
type UriFsPath = string

type GitRepoInfo = {
    repoNames: string[]
    rootUri?: vscode.Uri
}

export class RepoNameResolver {
    /**
     * Get the names of repositories (such as `github.com/foo/bar`) that contain the given file URI.
     * The file URI can also be a folder within a workspace or a workspace root folder.
     *
     * ❗️ For enterprise, this uses the Sourcegraph API to resolve repo names instead of the local
     * conversion function. ❗️
     */
    public getRepoNamesContainingUri(uri: vscode.Uri): MaybePendingObservable<RepoName[]> {
        return this.getRepoInfoContainingUri(uri).map(repoInfo => {
            if (repoInfo && repoInfo !== pendingOperation) {
                return repoInfo.repoNames
            }
            return repoInfo || []
        })
    }

    /**
     * Get repo root URI and the names of repositories (such as `github.com/foo/bar`)
     * that contain the given file URI. The file URI can also be a folder within
     * a workspace or a workspace root folder.
     *
     * ❗️ For enterprise, this uses the Sourcegraph API to resolve repo names instead of the local
     * conversion function. ❗️
     */
    public getRepoInfoContainingUri(uri: vscode.Uri): MaybePendingObservable<GitRepoInfo | null> {
        return combineLatest(
            promiseFactoryToObservable(signal => this.getRemoteUrlsInfoCached(uri, signal)),
            authStatus
        ).pipe(
            switchMapReplayOperation(
                ([repoInfo, authStatus]): MaybePendingObservable<GitRepoInfo | null> => {
                    const remoteUrls = repoInfo?.remoteUrls || []

                    // Use local conversion function for non-enterprise accounts.
                    if (isDotCom(authStatus)) {
                        const repoNames = remoteUrls
                            .map(convertGitCloneURLToCodebaseName)
                            .filter(isDefined)

                        return Observable.of(
                            repoNames.length ? { rootUri: repoInfo?.rootUri, repoNames } : null
                        )
                    }

                    return combineLatest(
                        ...remoteUrls.map(remoteUrl => this.getRepoNameCached(remoteUrl))
                    ).pipe(
                        map(maybeRepoNames => {
                            if (maybeRepoNames.includes(pendingOperation)) {
                                return pendingOperation
                            }

                            const repoNames = (
                                maybeRepoNames as Exclude<
                                    (typeof maybeRepoNames)[number],
                                    typeof pendingOperation
                                >[]
                            ).filter(isDefined)

                            return repoNames.length ? { rootUri: repoInfo?.rootUri, repoNames } : null
                        })
                    )
                }
            ),
            map(value => {
                if (isError(value)) {
                    logDebug('RepoNameResolver:getRepoNamesContainingUri', 'error', { verbose: value })
                    return null
                }
                return value
            })
        )
    }

    private fsPathToRemoteUrlsInfo = new LRUCache<UriFsPath, ReturnType<typeof gitRemoteUrlsInfoForUri>>(
        { max: 1000 }
    )

    private async getRemoteUrlsInfoCached(
        uri: vscode.Uri,
        signal?: AbortSignal
    ): Promise<GitRemoteUrlsInfo | undefined> {
        const key = uri.toString()
        let remoteUrlsInfo = this.fsPathToRemoteUrlsInfo.get(key)

        if (!remoteUrlsInfo) {
            remoteUrlsInfo = gitRemoteUrlsInfoForUri(uri, signal).catch(error => {
                logError('RepoNameResolver:getRemoteUrlsInfoCached', 'error', {
                    verbose: error,
                })
                return undefined
            })
            this.fsPathToRemoteUrlsInfo.set(key, remoteUrlsInfo)
        }
        return remoteUrlsInfo
    }

    private remoteUrlToRepoName = new LRUCache<RemoteUrl, ReturnType<typeof this.getRepoNameCached>>({
        max: 1000,
    })

    private getRepoNameCached(remoteUrl: string): MaybePendingObservable<RepoName | null> {
        const key = remoteUrl
        let observable = this.remoteUrlToRepoName.get(key)

        if (!observable) {
            observable = resolvedConfig.pipe(
                pluck('auth'),
                distinctUntilChanged(),
                switchMapReplayOperation(() =>
                    promiseFactoryToObservable(signal => graphqlClient.getRepoName(remoteUrl, signal))
                ),
                map(value => {
                    if (isError(value)) {
                        logDebug('RepoNameResolver:getRepoNameCached', 'error', { verbose: value })
                        return null
                    }
                    return value
                })
            )
            this.remoteUrlToRepoName.set(key, observable)
        }
        return observable
    }
}

/**
 * A a singleton instance of the `RepoNameResolver` class.
 */
export const repoNameResolver = new RepoNameResolver()

ContextFiltersProvider.repoNameResolver = {
    getRepoNamesContainingUri: (uri, signal) =>
        firstResultFromOperation(repoNameResolver.getRepoNamesContainingUri(uri), signal),
}
