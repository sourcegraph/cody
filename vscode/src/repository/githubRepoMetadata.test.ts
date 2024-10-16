import {
    type ObservableValue,
    firstResultFromOperation,
    fromLateSetSource,
} from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { describe, expect, it, vi } from 'vitest'
import {
    GitHubDotComRepoMetadata,
    type RepoRevMetaData,
    publicRepoMetadataIfAllWorkspaceReposArePublic,
} from './githubRepoMetadata'
import type * as remoteRepoModule from './remoteRepos'

declare namespace globalThis {
    let mockRemoteReposForAllWorkspaceFolders: ReturnType<
        typeof fromLateSetSource<
            ObservableValue<(typeof remoteRepoModule)['remoteReposForAllWorkspaceFolders']>
        >
    >
}

vi.mock('./remoteRepos', () => {
    globalThis.mockRemoteReposForAllWorkspaceFolders = fromLateSetSource()
    return {
        get remoteReposForAllWorkspaceFolders(): (typeof remoteRepoModule)['remoteReposForAllWorkspaceFolders'] {
            return globalThis.mockRemoteReposForAllWorkspaceFolders.observable
        },
    }
})

describe('publicRepoMetadataIfAllWorkspaceReposArePublic', () => {
    it('should return isPublic false when no folders have public repos', async () => {
        globalThis.mockRemoteReposForAllWorkspaceFolders.setSource(
            Observable.of<remoteRepoModule.RemoteRepo[]>([
                { id: 'r0', name: 'repo0' },
                { id: 'r1', name: 'repo1' },
            ]),
            false
        )
        const mockGetRepoMetadataUsingRepoName = vi
            .spyOn(GitHubDotComRepoMetadata.getInstance(), 'getRepoMetadataUsingRepoName')
            .mockImplementation(repoName =>
                Promise.resolve<RepoRevMetaData>({ isPublic: false, repoName })
            )

        const result = await firstResultFromOperation(publicRepoMetadataIfAllWorkspaceReposArePublic)
        expect(result).toEqual({ isPublic: false, repoMetadata: undefined })
        expect(
            mockGetRepoMetadataUsingRepoName.mock.calls.map(([firstArg]) => [firstArg])
        ).toStrictEqual([['repo0'], ['repo1']])
    })

    it('should return isPublic true with public repo metadata when all folders have at least one public repo', async () => {
        globalThis.mockRemoteReposForAllWorkspaceFolders.setSource(
            Observable.of<remoteRepoModule.RemoteRepo[]>([
                { id: 'r0', name: 'repo0' },
                { id: 'r1', name: 'repo1' },
            ]),
            false
        )
        const mockGetRepoMetadataUsingRepoName = vi
            .spyOn(GitHubDotComRepoMetadata.getInstance(), 'getRepoMetadataUsingRepoName')
            .mockImplementation(repoName =>
                Promise.resolve<RepoRevMetaData>({ isPublic: true, repoName, commit: 'aaa' })
            )

        const result = await firstResultFromOperation(publicRepoMetadataIfAllWorkspaceReposArePublic)
        expect(result).toEqual({
            isPublic: true,
            repoMetadata: [
                { isPublic: true, repoName: 'repo0', commit: 'aaa' },
                { isPublic: true, repoName: 'repo1', commit: 'aaa' },
            ],
        })
        expect(
            mockGetRepoMetadataUsingRepoName.mock.calls.map(([firstArg]) => [firstArg])
        ).toStrictEqual([['repo0'], ['repo1']])
    })

    it('should return !isPublic if no GitHub metadata is available', async () => {
        globalThis.mockRemoteReposForAllWorkspaceFolders.setSource(
            Observable.of<remoteRepoModule.RemoteRepo[]>([
                { id: 'r0', name: 'repo0' },
                { id: 'r1', name: 'repo1' },
            ]),
            false
        )
        const mockGetRepoMetadataUsingRepoName = vi
            .spyOn(GitHubDotComRepoMetadata.getInstance(), 'getRepoMetadataUsingRepoName')
            .mockImplementation(() => Promise.resolve<RepoRevMetaData | undefined>(undefined))

        const result = await firstResultFromOperation(publicRepoMetadataIfAllWorkspaceReposArePublic)
        expect(result).toEqual({ isPublic: false, repoMetadata: undefined })
        expect(mockGetRepoMetadataUsingRepoName).toBeCalledTimes(2)
    })

    it('should return !isPublic if folderURIs array is empty', async () => {
        globalThis.mockRemoteReposForAllWorkspaceFolders.setSource(
            Observable.of<remoteRepoModule.RemoteRepo[]>([]),
            false
        )
        const mockGetRepoMetadataUsingRepoName = vi
            .spyOn(GitHubDotComRepoMetadata.getInstance(), 'getRepoMetadataUsingRepoName')
            .mockImplementation(() => Promise.resolve<RepoRevMetaData | undefined>(undefined))

        const result = await firstResultFromOperation(publicRepoMetadataIfAllWorkspaceReposArePublic)
        expect(result).toEqual({ isPublic: false, repoMetadata: undefined })
        expect(mockGetRepoMetadataUsingRepoName).toBeCalledTimes(0)
    })

    it('should handle missing metadata for some folders', async () => {
        globalThis.mockRemoteReposForAllWorkspaceFolders.setSource(
            Observable.of<remoteRepoModule.RemoteRepo[]>([
                { id: 'r0', name: 'repo0' },
                { id: 'r1', name: 'repo1' },
            ]),
            false
        )
        const mockGetRepoMetadataUsingRepoName = vi
            .spyOn(GitHubDotComRepoMetadata.getInstance(), 'getRepoMetadataUsingRepoName')
            .mockImplementation(repoName =>
                Promise.resolve<RepoRevMetaData | undefined>(
                    repoName === 'repo0' ? undefined : { isPublic: true, repoName, commit: 'aaa' }
                )
            )

        const result = await firstResultFromOperation(publicRepoMetadataIfAllWorkspaceReposArePublic)
        expect(result).toEqual({ isPublic: false, repoMetadata: undefined })
        expect(mockGetRepoMetadataUsingRepoName).toBeCalledTimes(2)
    })

    it('should handle rejected promises in folderURIToRepoMetadata', async () => {
        globalThis.mockRemoteReposForAllWorkspaceFolders.setSource(
            Observable.of<remoteRepoModule.RemoteRepo[]>([
                { id: 'r0', name: 'repo0' },
                { id: 'r1', name: 'repo1' },
            ]),
            false
        )
        const mockGetRepoMetadataUsingRepoName = vi
            .spyOn(GitHubDotComRepoMetadata.getInstance(), 'getRepoMetadataUsingRepoName')
            .mockImplementation(repoName =>
                repoName === 'repo0'
                    ? Promise.resolve<RepoRevMetaData | undefined>({
                          isPublic: true,
                          repoName,
                          commit: 'aaa',
                      })
                    : Promise.reject(new Error('x'))
            )

        const result = await firstResultFromOperation(publicRepoMetadataIfAllWorkspaceReposArePublic)
        expect(result).toEqual({ isPublic: false, repoMetadata: undefined })
        expect(mockGetRepoMetadataUsingRepoName).toBeCalledTimes(2)
    })
})
