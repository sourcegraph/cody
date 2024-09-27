import {
    authStatus,
    combineLatest,
    debounceTime,
    fromVSCodeEvent,
    graphqlClient,
    isError,
    type pendingOperation,
    promiseFactoryToObservable,
    startWith,
    switchMapReplayOperation,
} from '@sourcegraph/cody-shared'
import { Observable, map } from 'observable-fns'
import * as vscode from 'vscode'
import { repoNameResolver } from './repo-name-resolver'

export interface RemoteRepo {
    /** The name of the repository (e.g., `github.com/foo/bar`). */
    name: string

    /** The GraphQL ID of the repository on the Sourcegraph instance. */
    id: string
}

const MAX_REPO_COUNT = 10

const workspaceFolders: Observable<readonly vscode.WorkspaceFolder[] | undefined> = fromVSCodeEvent(
    vscode.workspace.onDidChangeWorkspaceFolders
).pipe(
    startWith(undefined),
    map(() => vscode.workspace.workspaceFolders)
)

/**
 * A list of all remote repositories for all workspace root folders.
 */
export const remoteReposForAllWorkspaceFolders: Observable<
    RemoteRepo[] | typeof pendingOperation | Error
> = combineLatest([
    workspaceFolders.pipe(
        // The vscode.git extension has a delay before we can fetch a workspace folder's remote.
        debounceTime(2000)
    ),
    authStatus,
]).pipe(
    switchMapReplayOperation(([workspaceFolders]): Observable<RemoteRepo[]> => {
        if (!workspaceFolders) {
            return Observable.of([])
        }

        return promiseFactoryToObservable(async signal =>
            (
                await Promise.all(
                    workspaceFolders.map(folder =>
                        repoNameResolver
                            .getRepoNamesContainingUri(folder.uri)
                            .then(async (repoNames): Promise<RemoteRepo[]> => {
                                if (repoNames.length === 0) {
                                    // If we pass an empty repoNames array to getRepoIds, we would
                                    // fetch the first 10 repos from the Sourcegraph instance,
                                    // because it would think that argument is not set.
                                    return []
                                }
                                const reposOrError = await graphqlClient.getRepoIds(
                                    repoNames,
                                    MAX_REPO_COUNT,
                                    signal
                                )
                                if (isError(reposOrError)) {
                                    throw reposOrError
                                }
                                return reposOrError
                            })
                    )
                )
            ).flat()
        )
    })
)
