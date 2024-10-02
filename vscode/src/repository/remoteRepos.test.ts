import {
    AUTH_STATUS_FIXTURE_AUTHED,
    type AuthStatus,
    graphqlClient,
    isDefined,
    mockAuthStatus,
    pendingOperation,
    readValuesFrom,
} from '@sourcegraph/cody-shared'
import { Observable, Subject } from 'observable-fns'
import { describe, expect, test, vi } from 'vitest'
import * as vscode from 'vscode'
import { EventEmitter } from '../testutils/mocks'
import type { vscodeGitAPI } from './git-extension-api'
import { remoteReposForAllWorkspaceFolders } from './remoteRepos'
import { repoNameResolver } from './repo-name-resolver'

vi.mock('./git-extension-api', () => ({
    vscodeGitAPI: {
        getRepository: () => null,
    } satisfies Partial<typeof vscodeGitAPI>,
}))

describe('remoteReposForAllWorkspaceFolders', () => {
    test('emits remote repos for all workspace folders', async () => {
        vi.useFakeTimers()

        vi.spyOn(vscode.workspace, 'workspaceFolders', 'get').mockReturnValue([
            { index: 0, name: 'w0', uri: vscode.Uri.parse('file:///w0') },
            { index: 1, name: 'w1', uri: vscode.Uri.parse('file:///w1') },
            { index: 2, name: 'w2', uri: vscode.Uri.parse('file:///w2') },
        ])
        const onDidChangeWorkspaceFoldersEvent = new EventEmitter<any>()
        vi.spyOn(vscode.workspace, 'onDidChangeWorkspaceFolders').mockImplementation(
            (...args: Parameters<(typeof vscode)['workspace']['onDidChangeWorkspaceFolders']>) =>
                onDidChangeWorkspaceFoldersEvent.event(...args)
        )

        const authStatusSubject = new Subject<AuthStatus>()
        mockAuthStatus(authStatusSubject)

        const mockGetRepoNamesContainingUri = vi
            .spyOn(repoNameResolver, 'getRepoNamesContainingUri')
            .mockImplementation(uri =>
                Observable.of(
                    uri.path.includes('w0') ? ['repo0'] : uri.path.includes('w1') ? ['repo1'] : []
                )
            )

        const mockGetRepoIds = vi
            .spyOn(graphqlClient, 'getRepoIds')
            .mockImplementation(repoNames =>
                Promise.resolve(
                    [
                        repoNames.includes('repo0') ? { id: 'id0', name: 'repo0' } : undefined,
                        repoNames.includes('repo1') ? { id: 'id1', name: 'repo1' } : undefined,
                    ].filter(isDefined)
                )
            )

        const { values, unsubscribe, done } = readValuesFrom(remoteReposForAllWorkspaceFolders)

        onDidChangeWorkspaceFoldersEvent.fire(undefined)
        authStatusSubject.next(AUTH_STATUS_FIXTURE_AUTHED)

        // Need to wait for the vscode.git extension delay (2000ms).
        await vi.advanceTimersByTimeAsync(1900)
        expect(values).toStrictEqual<typeof values>([])

        await vi.advanceTimersByTimeAsync(100)
        expect(values).toStrictEqual<typeof values>([
            pendingOperation,
            [
                { id: 'id0', name: 'repo0' },
                { id: 'id1', name: 'repo1' },
            ],
        ])

        unsubscribe()
        await done

        expect(mockGetRepoNamesContainingUri.mock.calls).toStrictEqual([
            [vscode.Uri.parse('file:///w0')],
            [vscode.Uri.parse('file:///w1')],
            [vscode.Uri.parse('file:///w2')],
        ])
        expect(mockGetRepoIds.mock.calls.map(([firstArg]) => firstArg)).toStrictEqual([
            ['repo0', 'repo1'],
        ])
    })
})
