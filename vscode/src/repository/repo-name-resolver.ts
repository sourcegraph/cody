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

import { gitRemoteUrlsForUri } from './remote-urls-from-parent-dirs'

type RemoteUrl = string
type RepoName = string
type UriFsPath = string

export class RepoNameResolver {
    /**
     * Get the names of repositories (such as `github.com/foo/bar`) that contain the given file URI.
     * The file URI can also be a folder within a workspace or a workspace root folder.
     *
     * ❗️ For enterprise, this uses the Sourcegraph API to resolve repo names instead of the local
     * conversion function. ❗️
     */
    public getRepoNamesContainingUri(uri: vscode.Uri): MaybePendingObservable<RepoName[]> {
        return combineLatest(
            promiseFactoryToObservable(signal => this.getRemoteUrlsCached(uri, signal)),
            authStatus
        ).pipe(
            switchMapReplayOperation(([remoteUrls, authStatus]) => {
                // Use local conversion function for non-enterprise accounts.
                if (isDotCom(authStatus)) {
                    return Observable.of(
                        remoteUrls.map(convertGitCloneURLToCodebaseName).filter(isDefined)
                    )
                }

                return combineLatest(
                    ...remoteUrls.map(remoteUrl => this.getRepoNameCached(remoteUrl))
                ).pipe(
                    map(repoNames =>
                        repoNames.includes(pendingOperation)
                            ? pendingOperation
                            : (
                                  repoNames as Exclude<
                                      (typeof repoNames)[number],
                                      typeof pendingOperation
                                  >[]
                              ).filter(isDefined)
                    )
                )
            }),
            map(value => {
                if (isError(value)) {
                    logDebug('RepoNameResolver:getRepoNamesContainingUri', 'error', { verbose: value })
                    return []
                }
                return value
            })
        )
    }

    private fsPathToRemoteUrlsInfo = new LRUCache<UriFsPath, ReturnType<typeof gitRemoteUrlsForUri>>({
        max: 1000,
    })

    private async getRemoteUrlsCached(uri: vscode.Uri, signal?: AbortSignal): Promise<RemoteUrl[]> {
        const key = uri.toString()
        let remoteUrlsInfo = this.fsPathToRemoteUrlsInfo.get(key)

        if (!remoteUrlsInfo) {
            remoteUrlsInfo = gitRemoteUrlsForUri(uri, signal).catch(error => {
                logError('RepoNameResolver:getRemoteUrlsInfoCached', 'error', {
                    verbose: error,
                })
                return []
            })
            this.fsPathToRemoteUrlsInfo.set(key, remoteUrlsInfo)
        }
        return remoteUrlsInfo
    }

    private remoteUrlToRepoName = new LRUCache<RemoteUrl, ReturnType<typeof this.getRepoNameCached>>({
        max: 100,
    })
    private getRepoNameCached(remoteUrl: string): MaybePendingObservable<RepoName | null> {
        const key = remoteUrl
        let observable = this.remoteUrlToRepoName.get(key)

        if (!observable) {
            observable = resolvedConfig.pipe(
                pluck('auth'),
                distinctUntilChanged(),
                switchMapReplayOperation(
                    () =>
                        promiseFactoryToObservable(signal =>
                            graphqlClient.getRepoName(remoteUrl, signal)
                        ),
                    {
                        // Keep this observable alive with cached repo names,
                        // even without active subscribers. It's essential for
                        // `getRepoNameCached` in `ContextFiltersProvider`, which is
                        // part of the latency-sensitive autocomplete critical path.
                        shouldCountRefs: false,
                    }
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
