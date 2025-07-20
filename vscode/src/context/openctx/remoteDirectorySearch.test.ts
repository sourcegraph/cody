import {
    CLIENT_CAPABILITIES_FIXTURE,
    REMOTE_DIRECTORY_PROVIDER_URI,
    graphqlClient,
    mockClientCapabilities,
    mockResolvedConfig
} from '@sourcegraph/cody-shared'
import { describe, expect, test, vi } from 'vitest'
import { createRemoteDirectoryProvider } from './remoteDirectorySearch'

// Mock the getRepositoryMentions function
vi.mock('./common/get-repository-mentions', () => ({
    getRepositoryMentions: vi.fn(),
}))

// Mock client capabilities to avoid "clientCapabilities called before configuration was set" error
mockClientCapabilities(CLIENT_CAPABILITIES_FIXTURE)

const auth = { serverEndpoint: 'https://sourcegraph.com' }

// Test the extractRepoAndBranch function logic
function extractRepoAndBranch(input: string): [string, string | undefined] {
    // Handle case where input contains a colon (repo:directory@branch)
    const colonIndex = input.indexOf(':')
    if (colonIndex !== -1) {
        const repoPart = input.substring(0, colonIndex)
        const atIndex = repoPart.indexOf('@')
        if (atIndex !== -1) {
            return [repoPart.substring(0, atIndex), repoPart.substring(atIndex + 1)]
        }
        return [repoPart, undefined]
    }

    // Handle simple case: repo@branch or repo
    const atIndex = input.indexOf('@')
    if (atIndex !== -1) {
        return [input.substring(0, atIndex), input.substring(atIndex + 1)]
    }

    return [input, undefined]
}

describe('RemoteDirectoryProvider branch parsing', () => {
    describe('extractRepoAndBranch', () => {
        test('should extract repo name without branch', () => {
            const [repo, branch] = extractRepoAndBranch('test-repo')
            expect(repo).toBe('test-repo')
            expect(branch).toBeUndefined()
        })

        test('should extract repo name with branch', () => {
            const [repo, branch] = extractRepoAndBranch('test-repo@feature-branch')
            expect(repo).toBe('test-repo')
            expect(branch).toBe('feature-branch')
        })

        test('should handle repo:directory format without branch', () => {
            const [repo, branch] = extractRepoAndBranch('test-repo:src/components')
            expect(repo).toBe('test-repo')
            expect(branch).toBeUndefined()
        })

        test('should handle repo@branch:directory format', () => {
            const [repo, branch] = extractRepoAndBranch('test-repo@dev:src/components')
            expect(repo).toBe('test-repo')
            expect(branch).toBe('dev')
        })

        test('should handle complex branch names', () => {
            const [repo, branch] = extractRepoAndBranch('my-repo@feature/fix-123')
            expect(repo).toBe('my-repo')
            expect(branch).toBe('feature/fix-123')
        })

        test('should handle empty string', () => {
            const [repo, branch] = extractRepoAndBranch('')
            expect(repo).toBe('')
            expect(branch).toBeUndefined()
        })

        test('should handle @ at the end', () => {
            const [repo, branch] = extractRepoAndBranch('test-repo@')
            expect(repo).toBe('test-repo')
            expect(branch).toBe('')
        })

        test('should extract github.com/mrdoob/three.js@dev correctly', () => {
            const [repo, branch] = extractRepoAndBranch('github.com/mrdoob/three.js@dev')
            expect(repo).toBe('github.com/mrdoob/three.js')
            expect(branch).toBe('dev')
        })

        test('should handle branch names with hyphens', () => {
            const [repo, branch] = extractRepoAndBranch('test-repo@feature-branch')
            expect(repo).toBe('test-repo')
            expect(branch).toBe('feature-branch')
        })

        test('should handle branch names with slashes', () => {
            const [repo, branch] = extractRepoAndBranch('test-repo@fix/feature')
            expect(repo).toBe('test-repo')
            expect(branch).toBe('fix/feature')
        })

        test('should handle complex branch names with multiple special characters', () => {
            const [repo, branch] = extractRepoAndBranch('my-repo@feature/fix-123_test')
            expect(repo).toBe('my-repo')
            expect(branch).toBe('feature/fix-123_test')
        })

        test('should handle branch names with dots', () => {
            const [repo, branch] = extractRepoAndBranch('test-repo@release/v1.2.3')
            expect(repo).toBe('test-repo')
            expect(branch).toBe('release/v1.2.3')
        })

        test('should handle repo:directory@branch format with special characters', () => {
            const [repo, branch] = extractRepoAndBranch('test-repo@feature/fix-123:src/components')
            expect(repo).toBe('test-repo')
            expect(branch).toBe('feature/fix-123')
        })
    })
})

describe('RemoteDirectoryProvider mentions', () => {
    test('should handle branch selection for root directory search', async () => {
        // Mock the resolved config
        mockResolvedConfig({
            auth: {
                serverEndpoint: auth.serverEndpoint,
            },
        })

        // Mock the graphqlClient.searchFileMatches method
        const mockSearchFileMatches = {
            search: {
                results: {
                    results: [
                        {
                            __typename: 'FileMatch',
                            repository: {
                                id: 'repo-id',
                                name: 'github.com/mrdoob/three.js',
                            },
                            file: {
                                url: '/github.com/mrdoob/three.js@dev/-/tree/docs',
                                path: 'docs',
                                commit: {
                                    oid: 'abc123',
                                },
                            },
                        },
                    ],
                },
            },
        }

        vi.spyOn(graphqlClient, 'searchFileMatches').mockResolvedValue(mockSearchFileMatches)

        const provider = createRemoteDirectoryProvider()
        const mentions = await provider.mentions?.({ query: 'github.com/mrdoob/three.js@dev' }, {})

        expect(mentions).toHaveLength(1)

        expect(mentions?.[0]).toEqual({
            uri: `${auth.serverEndpoint}/github.com/mrdoob/three.js@dev/-/tree/docs`,
            title: 'docs',
            description: ' ',
            data: {
                branch: "dev",
                repoName: 'github.com/mrdoob/three.js',
                repoID: 'repo-id',
                rev: 'abc123',
                directoryPath: 'docs',
            },
        })
    })

    test('should handle branch selection with directory path filtering', async () => {
        // Mock the resolved config
        mockResolvedConfig({
            auth: {
                serverEndpoint: auth.serverEndpoint,
            },
        })

        // Mock the graphqlClient.searchFileMatches method
        const mockSearchFileMatches = {
            search: {
                results: {
                    results: [
                        {
                            __typename: 'FileMatch',
                            repository: {
                                id: 'repo-id',
                                name: 'github.com/mrdoob/three.js',
                            },
                            file: {
                                url: '/github.com/mrdoob/three.js@e2e/-/tree/manual/en',
                                path: 'manual/en',
                                commit: {
                                    oid: 'abc123',
                                },
                            },
                        },
                    ],
                },
            },
        }

        vi.spyOn(graphqlClient, 'searchFileMatches').mockResolvedValue(mockSearchFileMatches)

        const provider = createRemoteDirectoryProvider()
        const mentions = await provider.mentions?.(
            { query: 'github.com/mrdoob/three.js@e2e/manual' },
            {}
        )

        expect(mentions).toHaveLength(1)
        expect(mentions?.[0]).toEqual({
            uri: `${auth.serverEndpoint}/github.com/mrdoob/three.js@e2e/-/tree/manual/en`,
            title: 'manual/en',
            description: ' ',
            data: {
                repoName: 'github.com/mrdoob/three.js',
                repoID: 'repo-id',
                rev: 'abc123',
                directoryPath: 'manual/en',
                branch: 'e2e',
            },
        })

        // Verify the correct parameters were passed to searchFileMatches
        expect(graphqlClient.searchFileMatches).toHaveBeenCalledWith(
            'repo:^github\\.com/mrdoob/three\\.js$@e2e file:^manual.*\\/.* select:file.directory count:10'
        )
    })

    test('should handle branch names with hyphens in search query', async () => {
        // Mock the resolved config
        mockResolvedConfig({
            auth: {
                serverEndpoint: auth.serverEndpoint,
            },
        })

        // Mock the graphqlClient.searchFileMatches method
        const mockSearchFileMatches = {
            search: {
                results: {
                    results: [
                        {
                            __typename: 'FileMatch',
                            repository: {
                                id: 'repo-id',
                                name: 'test-repo',
                            },
                            file: {
                                url: '/test-repo@feature-branch/-/tree/src',
                                path: 'src',
                                commit: {
                                    oid: 'abc123',
                                },
                            },
                        },
                    ],
                },
            },
        }

        vi.spyOn(graphqlClient, 'searchFileMatches').mockResolvedValue(mockSearchFileMatches)

        const provider = createRemoteDirectoryProvider()
        const mentions = await provider.mentions?.({ query: 'test-repo@feature-branch' }, {})

        expect(mentions).toHaveLength(1)
        expect(mentions?.[0]).toEqual({
            uri: `${auth.serverEndpoint}/test-repo@feature-branch/-/tree/src`,
            title: 'src',
            description: ' ',
            data: {
                repoName: 'test-repo',
                repoID: 'repo-id',
                rev: 'abc123',
                directoryPath: 'src',
                branch: 'feature-branch',
            },
        })

        // Verify the branch name is used in the search query
        expect(graphqlClient.searchFileMatches).toHaveBeenCalledWith(
            'repo:^test-repo$@feature-branch file:[^/]+\\/.* select:file.directory count:10'
        )
    })

    test('should handle repo:@branch format (colon followed by @branch)', async () => {
        // Mock the resolved config
        mockResolvedConfig({
            auth: {
                serverEndpoint: auth.serverEndpoint,
            },
        })

        // Mock the graphqlClient.searchFileMatches method
        const mockSearchFileMatches = {
            search: {
                results: {
                    results: [
                        {
                            __typename: 'FileMatch',
                            repository: {
                                id: 'repo-id',
                                name: 'test-repo',
                            },
                            file: {
                                url: '/test-repo@feature-branch/-/tree/docs',
                                path: 'docs',
                                commit: {
                                    oid: 'abc123',
                                },
                            },
                        },
                    ],
                },
            },
        }

        vi.spyOn(graphqlClient, 'searchFileMatches').mockResolvedValue(mockSearchFileMatches)

        const provider = createRemoteDirectoryProvider()
        const mentions = await provider.mentions?.({ query: 'test-repo:@feature-branch' }, {})

        expect(mentions).toHaveLength(1)
        expect(mentions?.[0]).toEqual({
            uri: `${auth.serverEndpoint}/test-repo@feature-branch/-/tree/docs`,
            title: 'docs',
            description: ' ',
            data: {
                repoName: 'test-repo',
                repoID: 'repo-id',
                rev: 'abc123',
                directoryPath: 'docs',
                branch: 'feature-branch',
            },
        })

        // Verify the correct parameters were passed to searchFileMatches
        expect(graphqlClient.searchFileMatches).toHaveBeenCalledWith(
            'repo:^test-repo$@feature-branch file:[^/]+\\/.* select:file.directory count:10'
        )
    })

    test('should handle repo:@branch/directory format', async () => {
        // Mock the resolved config
        mockResolvedConfig({
            auth: {
                serverEndpoint: auth.serverEndpoint,
            },
        })

        // Mock the graphqlClient.searchFileMatches method
        const mockSearchFileMatches = {
            search: {
                results: {
                    results: [
                        {
                            __typename: 'FileMatch',
                            repository: {
                                id: 'repo-id',
                                name: 'test-repo',
                            },
                            file: {
                                url: '/test-repo@dev/-/tree/src/components',
                                path: 'src/components',
                                commit: {
                                    oid: 'abc123',
                                },
                            },
                        },
                    ],
                },
            },
        }

        vi.spyOn(graphqlClient, 'searchFileMatches').mockResolvedValue(mockSearchFileMatches)

        const provider = createRemoteDirectoryProvider()
        const mentions = await provider.mentions?.({ query: 'test-repo:@dev/src' }, {})

        expect(mentions).toHaveLength(1)
        expect(mentions?.[0]).toEqual({
            uri: `${auth.serverEndpoint}/test-repo@dev/-/tree/src/components`,
            title: 'src/components',
            description: ' ',
            data: {
                repoName: 'test-repo',
                repoID: 'repo-id',
                rev: 'abc123',
                directoryPath: 'src/components',
                branch: 'dev',
            },
        })

        // Verify the correct parameters were passed to searchFileMatches
        expect(graphqlClient.searchFileMatches).toHaveBeenCalledWith(
            'repo:^test-repo$@dev file:^src.*\\/.* select:file.directory count:10'
        )
    })

    test('should show branch suggestions when user types repo:', async () => {
        // Mock the resolved config
        mockResolvedConfig({
            auth: {
                serverEndpoint: auth.serverEndpoint,
            },
        })

        // Mock getRepositoryMentions to return a repo with branch info
        const mockGetRepositoryMentions = vi.fn().mockResolvedValue([
            {
                title: 'test-repo',
                providerUri: 'internal-remote-directory-search',
                uri: 'https://sourcegraph.com/test-repo',
                description: ' ',
                data: {
                    repoId: 'repo-id',
                    repoName: 'test-repo',
                    defaultBranch: 'main',
                    branches: ['main', 'develop', 'feature-branch'],
                    isIgnored: false,
                },
            }
        ])

        // Import and mock the getRepositoryMentions function
        const { getRepositoryMentions } = await import('./common/get-repository-mentions')
        vi.mocked(getRepositoryMentions).mockImplementation(mockGetRepositoryMentions)

        const provider = createRemoteDirectoryProvider()
        const mentions = await provider.mentions?.({ query: 'test-repo:' }, {})

        expect(mentions).toHaveLength(4) // default branch + 2 other branches + search hint

        // Check default branch mention
        expect(mentions?.[0]).toEqual({
            uri: `${auth.serverEndpoint}/test-repo@main`,
            title: '@main',
            description: 'Default branch',
            data: {
                repoName: 'test-repo',
                repoID: 'repo-id',
                branch: 'main',
            },
        })

        // Check other branch mentions
        expect(mentions?.[1]).toEqual({
            uri: `${auth.serverEndpoint}/test-repo@develop`,
            title: '@develop',
            description: ' ',
            data: {
                repoName: 'test-repo',
                repoID: 'repo-id',
                branch: 'develop',
            },
        })

    })

    test('should handle fuzzy branch search when user types repo:@query', async () => {
        // Mock the resolved config
        mockResolvedConfig({
            auth: {
                serverEndpoint: auth.serverEndpoint,
            },
        })

        // Mock getRepositoryMentions to return branch data
        const { getRepositoryMentions } = await import('./common/get-repository-mentions')
        vi.mocked(getRepositoryMentions).mockResolvedValue([
            {
                title: 'test-repo',
                providerUri: REMOTE_DIRECTORY_PROVIDER_URI,
                uri: `${auth.serverEndpoint}/test-repo`,
                description: ' ',
                data: {
                    repoId: 'repo-id',
                    repoName: 'test-repo',
                    defaultBranch: 'main',
                    branches: [
                        'main',
                        'feature/search-improvement',
                        'feature/search-ui',
                        'fix/search-bug',
                        'develop'
                    ],
                    isIgnored: false,
                },
            }
        ])

        const provider = createRemoteDirectoryProvider()
        const mentions = await provider.mentions?.({ query: 'test-repo:@feat' }, {})

        expect(mentions).toHaveLength(2) // 2 matching branches

        // Check that getRepositoryMentions was called
        expect(getRepositoryMentions).toHaveBeenCalledWith('test-repo', REMOTE_DIRECTORY_PROVIDER_URI)

        // Check that we get the matching branches (filtered by 'feat')
        expect(mentions?.[0]).toEqual({
            uri: `${auth.serverEndpoint}/test-repo@feature/search-improvement`,
            title: '@feature/search-improvement',
            description: ' ',
            data: {
                repoName: 'test-repo',
                repoID: 'repo-id',
                branch: 'feature/search-improvement',
            },
        })

        expect(mentions?.[1]).toEqual({
            uri: `${auth.serverEndpoint}/test-repo@feature/search-ui`,
            title: '@feature/search-ui',
            description: ' ',
            data: {
                repoName: 'test-repo',
                repoID: 'repo-id',
                branch: 'feature/search-ui',
            },
        })

        expect(mentions?.[1]).toEqual({
            uri: `${auth.serverEndpoint}/test-repo@feature/search-ui`,
            title: '@feature/search-ui',
            description: ' ',
            data: {
                repoName: 'test-repo',
                repoID: 'repo-id',
                branch: 'feature/search-ui',
            },
        })
    })
})

describe('RemoteDirectoryProvider directory contents', () => {
    test('should return directory contents as items', async () => {
        // Mock the resolved config
        mockResolvedConfig({
            auth: {
                serverEndpoint: auth.serverEndpoint,
            },
        })


        // Mock contextSearch to return empty array to trigger fallback
        vi.spyOn(graphqlClient, 'contextSearch').mockResolvedValue([])

        // Mock the graphqlClient.getDirectoryContents method
        const mockDirectoryContents = {
            repository: {
                commit: {
                    tree: {
                        entries: [
                            {
                                name: 'file1.ts',
                                path: 'src/file1.ts',
                                url: '/repo/-/blob/src/file1.ts',
                                content: 'const foo = "bar";',
                                byteSize: 18,
                            },
                            {
                                name: 'file2.js',
                                path: 'src/file2.js',
                                url: '/repo/-/blob/src/file2.js',
                                content: 'console.log("hello");',
                                byteSize: 21,
                            },
                            {
                                name: 'subdir',
                                path: 'src/subdir',
                                url: '/repo/-/tree/src/subdir',
                                isDirectory: true,
                            },
                        ],
                    },
                },
            },
        }

        vi.spyOn(graphqlClient, 'getDirectoryContents').mockResolvedValue(mockDirectoryContents)

        const provider = createRemoteDirectoryProvider()
        const items = await provider.items?.(
            {
                mention: {
                    uri: 'test-uri',
                    title: 'test-title',
                    description: 'test-description',
                    data: {
                        repoName: 'test-repo',
                        repoID: 'repo-id',
                        directoryPath: 'src',
                        rev: 'develop',
                    },
                },
                message: 'test query',
            },
            {}
        )

        expect(items).toHaveLength(2) // Only files, not directories
        expect(items?.[0]).toEqual({
            url: `${auth.serverEndpoint}/test-repo@develop/-/blob/src/file1.ts`,
            title: 'src/file1.ts',
            ai: {
                content: 'const foo = "bar";',
            },
        })
        expect(items?.[1]).toEqual({
            url: `${auth.serverEndpoint}/test-repo@develop/-/blob/src/file2.js`,
            title: 'src/file2.js',
            ai: {
                content: 'console.log("hello");',
            },
        })
    })
})
