import { LRUCache } from 'lru-cache'
import { Observable, map } from 'observable-fns'
import * as vscode from 'vscode'

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
        // Fast-path (for Cody Web): if a workspace root is `repo:my/repo`, then files under it
        // have repo name `my/repo`.
        const root = vscode.workspace.getWorkspaceFolder(uri)
        if (root && root.uri.scheme === 'repo') {
            const repoName: RepoName = [root.uri.authority, root.uri.path]
                .filter(isDefined)
                .join('/')
                .replace(/^\/(.*?)\/?$/g, '$1') // trim leading/trailing slashes
            return Observable.of([repoName])
        }

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

                // stop here early so combine latest won't be in pending with empty list of streams
                if (remoteUrls.length === 0) {
                    return Observable.of([])
                }

                const remoteUrlsAndRepoNames = remoteUrls.map(url =>
                    this.getRepoNameCached(url).map(repoName => [url, repoName] as const)
                )
                return combineLatest(...remoteUrlsAndRepoNames).pipe(
                    map(remoteUrlsAndRepoNames => {
                        const repoNames: string[] = []
                        for (const [url, repoName] of remoteUrlsAndRepoNames) {
                            if (repoName === pendingOperation) {
                                return pendingOperation
                            }
                            // If we didn't get a repoName (means the repo is local only, not on instance),
                            // use the git clone URL as the repo name.
                            if (!repoName) {
                                const convertedName = convertGitCloneURLToCodebaseName(url)
                                if (convertedName) {
                                    repoNames.push(convertedName)
                                }
                            } else {
                                repoNames.push(repoName)
                            }
                        }
                        return repoNames
                    })
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

export const getFirstRepoNameContainingUri = (uri: vscode.Uri): Promise<RepoName | undefined> => {
    return firstResultFromOperation(repoNameResolver.getRepoNamesContainingUri(uri))
        .then(repoNames => repoNames[0])
        .catch(() => undefined)
}
