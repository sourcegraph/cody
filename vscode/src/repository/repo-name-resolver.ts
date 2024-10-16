import type * as vscode from 'vscode'

import {
    ContextFiltersProvider,
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

import { Observable, map } from 'observable-fns'
import { logDebug } from '../output-channel-logger'
import { gitRemoteUrlsForUri } from './remote-urls-from-parent-dirs'

export class RepoNameResolver {
    /**
     * Get the names of repositories (such as `github.com/foo/bar`) that contain the given file URI.
     * The file URI can also be a folder within a workspace or a workspace root folder.
     *
     * ❗️ For enterprise, this uses the Sourcegraph API to resolve repo names instead of the local
     * conversion function. ❗️
     */
    public getRepoNamesContainingUri(uri: vscode.Uri): Observable<string[] | typeof pendingOperation> {
        return combineLatest(
            promiseFactoryToObservable(signal => this.getUniqueRemoteUrlsCached(uri, signal)),
            authStatus
        ).pipe(
            switchMapReplayOperation(
                ([uniqueRemoteUrls, authStatus]): Observable<string[] | typeof pendingOperation> => {
                    // Use local conversion function for non-enterprise accounts.
                    if (isDotCom(authStatus)) {
                        return Observable.of(
                            uniqueRemoteUrls.map(convertGitCloneURLToCodebaseName).filter(isDefined)
                        )
                    }

                    return combineLatest(
                        ...uniqueRemoteUrls.map(remoteUrl => this.getRepoNameCached(remoteUrl))
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
                }
            ),
            map(value => {
                if (isError(value)) {
                    logDebug('RepoNameResolver:getRepoNamesContainingUri', 'error', { verbose: value })
                    return []
                }
                return value
            })
        )
    }

    private getUniqueRemoteUrlsCache: Partial<Record<string, Promise<string[]>>> = {}
    private async getUniqueRemoteUrlsCached(uri: vscode.Uri, signal?: AbortSignal): Promise<string[]> {
        const key = uri.toString()
        let uniqueRemoteUrls: Promise<string[]> | undefined = this.getUniqueRemoteUrlsCache[key]
        if (!uniqueRemoteUrls) {
            uniqueRemoteUrls = gitRemoteUrlsForUri(uri, signal)
                .then(remoteUrls => {
                    const uniqueRemoteUrls = Array.from(new Set(remoteUrls ?? [])).sort()
                    return uniqueRemoteUrls
                })
                .catch(error => {
                    logError('RepoNameResolver:getUniqueRemoteUrlsCached', 'error', {
                        verbose: error,
                    })
                    return []
                })
            this.getUniqueRemoteUrlsCache[key] = uniqueRemoteUrls
        }
        return uniqueRemoteUrls
    }

    private getRepoNameCache: Partial<
        Record<string, Observable<string | null | typeof pendingOperation>>
    > = {}
    private getRepoNameCached(remoteUrl: string): Observable<string | null | typeof pendingOperation> {
        const key = remoteUrl
        let observable: ReturnType<typeof this.getRepoNameCached> | undefined =
            this.getRepoNameCache[key]
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
            this.getRepoNameCache[key] = observable
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
