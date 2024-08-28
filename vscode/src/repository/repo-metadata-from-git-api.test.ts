import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { type RepoRevMetaData, _getRepoMetadataIfPublic } from './repo-metadata-from-git-api'

describe('_getRepoMetadataIfPublic', () => {
    it('should return isPublic false when no folders have public repos', async () => {
        const folderURIs = [URI.parse('file:///path/to/folder1'), URI.parse('file:///path/to/folder2')]
        const folderURIToRepoRevMetadata: Map<string, Promise<RepoRevMetaData[]>> = new Map([
            [
                'file:///path/to/folder1',
                Promise.resolve([{ isPublic: false, repoName: 'repo1', commit: 'aaa' }]),
            ],
            [
                'file:///path/to/folder2',
                Promise.resolve([{ isPublic: false, repoName: 'repo2', commit: 'aaa' }]),
            ],
        ])

        const result = await _getRepoMetadataIfPublic(folderURIs, folderURIToRepoRevMetadata)
        expect(result).toEqual({ isPublic: false, repoMetadata: undefined })
    })

    it('should return isPublic true with public repo metadata when all folders have at least one public repo', async () => {
        const folderURIs = [URI.parse('file:///path/to/folder1'), URI.parse('file:///path/to/folder2')]
        const folderURIToRepoMetadata: Map<string, Promise<RepoRevMetaData[]>> = new Map([
            [
                'file:///path/to/folder1',
                Promise.resolve([
                    { isPublic: true, repoName: 'repo1', commit: 'aaa' },
                    { isPublic: false, repoName: 'repo2', commit: 'aaa' },
                ]),
            ],
            [
                'file:///path/to/folder2',
                Promise.resolve([
                    { isPublic: false, repoName: 'repo3', commit: 'aaa' },
                    { isPublic: true, repoName: 'repo4', commit: 'aaa' },
                ]),
            ],
        ])

        const result = await _getRepoMetadataIfPublic(folderURIs, folderURIToRepoMetadata)
        expect(result).toEqual({
            isPublic: true,
            repoMetadata: [
                { isPublic: true, repoName: 'repo1', commit: 'aaa' },
                { isPublic: true, repoName: 'repo4', commit: 'aaa' },
            ],
        })
    })

    it('should return !isPublic if folderURIs array is empty', async () => {
        const folderURIs: URI[] = []
        const result = await _getRepoMetadataIfPublic(folderURIs, new Map())
        expect(result).toEqual({ isPublic: false, repoMetadata: undefined })
    })

    it('should handle missing metadata for some folders', async () => {
        const folderURIs = [URI.parse('file:///path/to/folder1'), URI.parse('file:///path/to/folder2')]
        const folderURIToRepoMetadata: Map<string, Promise<RepoRevMetaData[]>> = new Map([
            [
                'file:///path/to/folder1',
                Promise.resolve([{ isPublic: true, repoName: 'repo1', commit: 'aaa' }]),
            ],
        ])

        const result = await _getRepoMetadataIfPublic(folderURIs, folderURIToRepoMetadata)
        expect(result).toEqual({ isPublic: false, repoMetadata: undefined })
    })

    it('should handle rejected promises in folderURIToRepoMetadata', async () => {
        const folderURIs = [URI.parse('file:///path/to/folder1'), URI.parse('file:///path/to/folder2')]
        const folderURIToRepoMetadata: Map<string, Promise<RepoRevMetaData[]>> = new Map([
            [
                'file:///path/to/folder1',
                Promise.resolve<RepoRevMetaData[]>([
                    { isPublic: true, repoName: 'repo1', commit: 'aaa' },
                ]),
            ],
            ['file:///path/to/folder2', Promise.reject(new Error('Failed to fetch metadata'))],
        ])

        const result = await _getRepoMetadataIfPublic(folderURIs, folderURIToRepoMetadata)
        expect(result).toEqual({ isPublic: false, repoMetadata: undefined })
    })

    it('should handle empty metadata for some folders', async () => {
        const folderURIs = [URI.parse('file:///path/to/folder1'), URI.parse('file:///path/to/folder2')]
        const folderURIToRepoMetadata: Map<string, Promise<RepoRevMetaData[]>> = new Map([
            [
                'file:///path/to/folder1',
                Promise.resolve([{ isPublic: true, repoName: 'repo1', commit: 'aaa' }]),
            ],
            ['file:///path/to/folder2', Promise.resolve([])],
        ])
        const result = await _getRepoMetadataIfPublic(folderURIs, folderURIToRepoMetadata)
        expect(result).toEqual({ isPublic: false, repoMetadata: undefined })
    })
})
