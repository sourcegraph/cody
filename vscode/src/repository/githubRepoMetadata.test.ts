import {
    type ObservableValue,
    firstResultFromOperation,
    fromLateSetSource,
} from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { localStorage, mockLocalStorage } from '../services/LocalStorageProvider'
import {
    GitHubDotComRepoMetadata,
    type RepoAccessibilityData,
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

describe('GitHubDotComRepoMetadata', () => {
    // Set up local storage backed by an object.
    let localStorageData: { [key: string]: unknown } = {}
    mockLocalStorage({
        get: (key: string) => localStorageData[key],
        update: (key: string, value: unknown) => {
            localStorageData[key] = value
        },
    } as any)

    const instance = GitHubDotComRepoMetadata.getInstance({ minLocalStorageUpdateTimeMs: 10 })

    const assertRepoAccessibilityDataChange = async (
        cachedData: RepoAccessibilityData[],
        currentData: RepoAccessibilityData[],
        expectedValue: boolean
    ) => {
        await localStorage.setGitHubRepoAccessibility(cachedData)
        instance.populateCacheFromLocalStorage()
        const isUpdated = instance.shouldUpdateCachedDataToLocalStorage(currentData)
        expect(isUpdated).toEqual(expectedValue)
    }

    beforeEach(() => {
        vi.useFakeTimers()
        localStorageData = {}
    })

    it('should return true when the data has changed', async () => {
        const previousData = [
            { repoName: 'repo1', isPublic: false },
            { repoName: 'repo2', isPublic: false },
            { repoName: 'repo3', isPublic: true },
        ]
        const newData = [
            { repoName: 'repo1', isPublic: true },
            { repoName: 'repo2', isPublic: false },
        ]
        assertRepoAccessibilityDataChange(previousData, newData, true)
    })

    it('should return false when the data has not changed', async () => {
        const data = [{ repoName: 'repo1', isPublic: true }]
        assertRepoAccessibilityDataChange(data, data, false)
    })

    it('should return true when the new data has additional entries', async () => {
        const previousData = [{ repoName: 'repo1', isPublic: true }]
        const newData = [
            { repoName: 'repo1', isPublic: true },
            { repoName: 'repo2', isPublic: false },
        ]
        assertRepoAccessibilityDataChange(previousData, newData, true)
    })

    it('should return true when the new data has fewer entries', async () => {
        const previousData = [
            { repoName: 'repo1', isPublic: true },
            { repoName: 'repo2', isPublic: false },
        ]
        const newData = [{ repoName: 'repo1', isPublic: true }]
        assertRepoAccessibilityDataChange(previousData, newData, true)
    })

    it('should return true when the new data is empty and previous data is not', async () => {
        const previousData = [{ repoName: 'repo1', isPublic: true }]
        const newData: RepoRevMetaData[] = []
        assertRepoAccessibilityDataChange(previousData, newData, true)
    })

    it('should return false when both new data and previous data are empty', async () => {
        const previousData: RepoRevMetaData[] = []
        const newData: RepoRevMetaData[] = []
        assertRepoAccessibilityDataChange(previousData, newData, false)
    })

    it('should return true when previous data is undefined', async () => {
        const newData = [{ repoName: 'repo1', isPublic: true }]
        assertRepoAccessibilityDataChange([], newData, true)
    })

    it('should return true when new data is undefined and previous data is defined', async () => {
        const previousData = [{ repoName: 'repo1', isPublic: true }]
        assertRepoAccessibilityDataChange(previousData, [], true)
    })

    it('should return false when both new data and previous data are undefined', async () => {
        assertRepoAccessibilityDataChange([], [], false)
    })

    it('should return false when repo order changes but data is the same', async () => {
        const previousData = [
            { repoName: 'repo1', isPublic: true },
            { repoName: 'repo2', isPublic: false },
        ]
        const newData = [
            { repoName: 'repo2', isPublic: false },
            { repoName: 'repo1', isPublic: true },
        ]
        assertRepoAccessibilityDataChange(previousData, newData, false)
    })

    it('should return true when repo entries are the same but isPublic value changes', async () => {
        const previousData = [{ repoName: 'repo1', isPublic: true }]
        const newData = [{ repoName: 'repo1', isPublic: false }]
        assertRepoAccessibilityDataChange(previousData, newData, true)
    })
})

describe('publicRepoMetadataIfAllWorkspaceReposArePublic', () => {
    beforeAll(() => {
        mockLocalStorage()
    })

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
