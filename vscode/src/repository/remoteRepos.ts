import {
    abortableOperation,
    authStatus,
    combineLatest,
    debounceTime,
    fromVSCodeEvent,
    graphqlClient,
    isError,
    pendingOperation,
    startWith,
    switchMapReplayOperation,
} from '@sourcegraph/cody-shared'
import { Observable, map } from 'observable-fns'
import * as vscode from 'vscode'
import { vscodeGitAPI } from './git-extension-api'
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
> = combineLatest(
    workspaceFolders.pipe(
        // The vscode.git extension has a delay before we can fetch a workspace folder's remote.
        debounceTime(vscodeGitAPI ? 2000 : 0)
    ),
    authStatus
).pipe(
    switchMapReplayOperation(
        ([workspaceFolders]): Observable<RemoteRepo[] | typeof pendingOperation> => {
            if (!workspaceFolders) {
                return Observable.of([])
            }

            // NOTE(sqs): This check is to preserve prior behavior where agent/JetBrains did not use
            // the old WorkspaceReposMonitor. We should make it so they can use it. See
            // https://linear.app/sourcegraph/issue/CODY-3906/agent-allow-use-of-existing-fallback-that-looks-at-gitconfig-to-get.
            if (!vscodeGitAPI) {
                return Observable.of([])
            }

            return combineLatest(
                ...workspaceFolders.map(folder => repoNameResolver.getRepoNamesContainingUri(folder.uri))
            ).pipe(
                map(repoNamesLists => {
                    const repoNames = repoNamesLists.flat()
                    if (repoNames.includes(pendingOperation)) {
                        return pendingOperation
                    }
                    return repoNames as Exclude<(typeof repoNames)[number], typeof pendingOperation>[]
                }),
                abortableOperation(async (repoNames, signal) => {
                    if (repoNames === pendingOperation) {
                        return pendingOperation
                    }
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
        }
    )
)
