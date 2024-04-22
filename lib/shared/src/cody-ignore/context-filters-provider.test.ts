import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import { type ContextFilters, graphqlClient } from '../sourcegraph-api/graphql/client'
import { ContextFiltersProvider } from './context-filters-provider'

describe('ContextFiltersProvider', () => {
    let provider: ContextFiltersProvider

    let getRepoNameFromWorkspaceUri: Mock<[vscode.Uri], any>

    beforeEach(() => {
        provider = new ContextFiltersProvider()
        vi.useFakeTimers()
        getRepoNameFromWorkspaceUri = vi.fn()
    })

    afterEach(() => {
        provider.dispose()
        vi.restoreAllMocks()
    })

    function apiResponseForFilters(contextFilters: ContextFilters) {
        return {
            data: { site: { codyContextFilters: { raw: contextFilters } } },
        }
    }

    async function initProviderWithContextFilters(contextFilters: ContextFilters): Promise<void> {
        vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue(
            apiResponseForFilters(contextFilters)
        )
        await provider.init(getRepoNameFromWorkspaceUri)
    }

    interface AssertFilters {
        label: string
        filters: ContextFilters
        allowed?: string[]
        ignored?: string[]
    }

    describe('isRepoNameIgnored', () => {
        it.each<AssertFilters>([
            {
                label: 'allows everything if both include and exclude are empty',
                filters: {
                    include: [],
                    exclude: [],
                },
                allowed: ['github.com/sourcegraph/cody', 'github.com/evilcorp/cody'],
                ignored: [],
            },
            {
                label: 'only include rules',
                filters: {
                    include: [{ repoNamePattern: '.*non-sensitive.*' }],
                    exclude: [],
                },
                allowed: ['github.com/sourcegraph/non-sensitive', 'github.com/non-sensitive/cody'],
                ignored: ['github.com/sensitive/whatever'],
            },
            {
                label: 'only exclude rules',
                filters: {
                    include: [],
                    exclude: [{ repoNamePattern: '.*sensitive.*' }],
                },
                allowed: ['github.com/sourcegraph/whatever', 'github.com/sourcegraph/cody'],
                ignored: ['github.com/sensitive/whatever'],
            },
            {
                label: 'include and exclude rules',
                filters: {
                    include: [
                        { repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' },
                        { repoNamePattern: '^github\\.com\\/evilcorp\\/.*' },
                    ],
                    exclude: [{ repoNamePattern: '.*sensitive.*' }],
                },
                allowed: ['github.com/sourcegraph/cody', 'github.com/evilcorp/cody'],
                ignored: ['github.com/sensitive/whatever'],
            },
            {
                label: 'does not allow a repo if it does not match the include pattern',
                filters: {
                    include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' }],
                    exclude: [{ repoNamePattern: '.*sensitive.*' }],
                },
                ignored: ['github.com/other/repo'],
            },
            {
                label: 'does not allow a repo if it matches the exclude pattern',
                filters: {
                    include: [
                        { repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' },
                        { repoNamePattern: '^github\\.com\\/sensitive\\/.*' },
                    ],
                    exclude: [
                        { repoNamePattern: '.*sensitive.*' },
                        { repoNamePattern: '.*not-allowed.*' },
                    ],
                },
                allowed: ['github.com/sourcegraph/cody'],
                ignored: [
                    'github.com/sensitive/sensitive-repo',
                    'github.com/sourcegraph/not-allowed-repo',
                ],
            },
            {
                label: 'excludes repos that match both include and exclude patterns',
                filters: {
                    include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' }],
                    exclude: [{ repoNamePattern: '.*sensitive.*' }],
                },
                ignored: ['github.com/sourcegraph/sensitive-repo'],
            },
            {
                label: 'excludes repos with anchored exclude pattern starting with the specific term',
                filters: {
                    include: [{ repoNamePattern: 'github\\.com\\/sourcegraph\\/.*' }],
                    exclude: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/sensitive.*' }],
                },
                ignored: ['github.com/sourcegraph/sensitive-data'],
                allowed: [
                    'company.github.com/sourcegraph/sensitive-data',
                    'github.com/sourcegraph/general',
                ],
            },
            {
                label: 'excludes repos with anchored exclude pattern ending with the specific term',
                filters: {
                    include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' }],
                    exclude: [{ repoNamePattern: '.*\\/sensitive$' }],
                },
                allowed: ['github.com/sourcegraph/data-sensitive'],
                ignored: ['github.com/sourcegraph/sensitive'],
            },
            {
                label: 'excludes repos using non-capturing groups',
                filters: {
                    include: [{ repoNamePattern: '^github\\.com\\/(sourcegraph|evilcorp)\\/.*' }],
                    exclude: [{ repoNamePattern: '.*\\/(sensitive|classified).*' }],
                },
                ignored: ['github.com/sourcegraph/sensitive-project'],
                allowed: ['github.com/evilcorp/public'],
            },
            {
                label: 'multiple include and exclude patterns',
                filters: {
                    include: [
                        { repoNamePattern: '^github\\.com\\/sourcegraph\\/.+' },
                        { repoNamePattern: '^github\\.com\\/docker\\/compose$' },
                        { repoNamePattern: '^github\\.com\\/.+\\/react' },
                    ],
                    exclude: [{ repoNamePattern: '.*cody.*' }, { repoNamePattern: '.+\\/docker\\/.+' }],
                },
                allowed: [
                    'github.com/sourcegraph/about',
                    'github.com/sourcegraph/annotate',
                    'github.com/sourcegraph/sourcegraph',
                    'github.com/facebook/react',
                ],
                ignored: ['github.com/docker/compose', 'github.com/sourcegraph/cody'],
            },
            {
                label: 'exclude everything',
                filters: {
                    include: [
                        { repoNamePattern: '^github\\.com\\/sourcegraph\\/.+' },
                        { repoNamePattern: '^github\\.com\\/docker\\/compose$' },
                        { repoNamePattern: '^github\\.com\\/.+\\/react' },
                    ],
                    exclude: [{ repoNamePattern: '.*cody.*' }, { repoNamePattern: '.*' }],
                },
                allowed: [],
                ignored: [
                    'github.com/sourcegraph/about',
                    'github.com/sourcegraph/annotate',
                    'github.com/sourcegraph/sourcegraph',
                    'github.com/facebook/react',
                    'github.com/docker/compose',
                    'github.com/sourcegraph/cody',
                ],
            },
            {
                label: 'invalid patterns cause all repo names to be excluded',
                filters: {
                    include: [
                        { repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' },
                        { repoNamePattern: '(invalid_regex' },
                    ],
                    exclude: [],
                },
                ignored: ['github.com/sourcegraph/cody'],
            },
        ])('$label', async ({ filters, allowed = [], ignored = [] }) => {
            await initProviderWithContextFilters(filters)

            for (const repoName of allowed) {
                expect(provider.isRepoNameIgnored(repoName)).toBe(false)
            }

            for (const repoName of ignored) {
                expect(provider.isRepoNameIgnored(repoName)).toBe(true)
            }
        })

        it('excludes everything on network errors', async () => {
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockRejectedValue(new Error('network error'))
            await provider.init(getRepoNameFromWorkspaceUri)

            expect(provider.isRepoNameIgnored('github.com/sourcegraph/whatever')).toBe(true)
        })

        it('excludes everything on unknown API errors', async () => {
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue(
                new Error('API error message')
            )
            await provider.init(getRepoNameFromWorkspaceUri)

            expect(provider.isRepoNameIgnored('github.com/sourcegraph/whatever')).toBe(true)
        })

        it('excludes everything on invalid response structure', async () => {
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue({
                data: { site: { codyContextFilters: { raw: { something: true } } } },
            })
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue(
                new Error('API error message')
            )
            await provider.init(getRepoNameFromWorkspaceUri)

            expect(provider.isRepoNameIgnored('github.com/sourcegraph/whatever')).toBe(true)
        })

        it('includes everything on empty responses', async () => {
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue({
                data: { site: { codyContextFilters: { raw: null } } },
            })
            await provider.init(getRepoNameFromWorkspaceUri)

            expect(provider.isRepoNameIgnored('github.com/sourcegraph/whatever')).toBe(false)
        })

        it('includes everything on for Sourcegraph API without context filters support', async () => {
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue(
                new Error('Error: Cannot query field `codyContextFilters`')
            )
            await provider.init(getRepoNameFromWorkspaceUri)

            expect(provider.isRepoNameIgnored('github.com/sourcegraph/whatever')).toBe(false)
        })

        it('uses cached results for repeated calls', async () => {
            const contextFilters = {
                include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' }],
                exclude: [],
            }

            const mockedApiRequest = vi
                .spyOn(graphqlClient, 'fetchSourcegraphAPI')
                .mockResolvedValue(apiResponseForFilters(contextFilters))

            await provider.init(getRepoNameFromWorkspaceUri)

            expect(provider.isRepoNameIgnored('github.com/sourcegraph/cody')).toBe(false)
            expect(provider.isRepoNameIgnored('github.com/sourcegraph/cody')).toBe(false)
            expect(mockedApiRequest).toBeCalledTimes(1)
        })

        it('refetches context filters after the specified interval', async () => {
            const mockContextFilters1 = {
                include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' }],
                exclude: [],
            }
            const mockContextFilters2 = {
                include: [{ repoNamePattern: '^github\\.com\\/other\\/.*' }],
                exclude: [],
            }
            const mockedApiRequest = vi
                .spyOn(graphqlClient, 'fetchSourcegraphAPI')
                .mockResolvedValueOnce(apiResponseForFilters(mockContextFilters1))
                .mockResolvedValueOnce(apiResponseForFilters(mockContextFilters2))
            await provider.init(getRepoNameFromWorkspaceUri)

            expect(mockedApiRequest).toBeCalledTimes(1)
            expect(provider.isRepoNameIgnored('github.com/sourcegraph/cody')).toBe(false)

            await vi.runOnlyPendingTimersAsync()

            expect(mockedApiRequest).toBeCalledTimes(2)
            expect(provider.isRepoNameIgnored('github.com/sourcegraph/cody')).toBe(true)
            expect(provider.isRepoNameIgnored('github.com/other/cody')).toBe(false)
        })
    })

    describe('isUriIgnored', () => {
        interface TestUriParams {
            repoName: string
            filePath: string
        }

        function getTestURI(params: TestUriParams): URI {
            const { repoName, filePath } = params

            getRepoNameFromWorkspaceUri.mockResolvedValue(`github.com/sourcegraph/${repoName}`)

            return URI.file(`/${repoName}/${filePath}`)
        }

        it('applies context filters correctly', async () => {
            await initProviderWithContextFilters({
                include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/cody' }],
                exclude: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/sourcegraph' }],
            })

            const includedURI = getTestURI({ repoName: 'cody', filePath: 'foo/bar.ts' })
            expect(includedURI.fsPath.replaceAll('\\', '/')).toBe('/cody/foo/bar.ts')
            expect(await getRepoNameFromWorkspaceUri(includedURI)).toBe('github.com/sourcegraph/cody')

            expect(await provider.isUriIgnored(includedURI)).toBe(false)

            const excludedURI = getTestURI({ repoName: 'sourcegraph', filePath: 'src/main.tsx' })
            expect(excludedURI.fsPath.replaceAll('\\', '/')).toBe('/sourcegraph/src/main.tsx')
            expect(await getRepoNameFromWorkspaceUri(excludedURI)).toBe(
                'github.com/sourcegraph/sourcegraph'
            )

            expect(await provider.isUriIgnored(excludedURI)).toBe(true)
        })

        it('returns `true` if repo name is not found', async () => {
            await initProviderWithContextFilters({
                include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/cody' }],
                exclude: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/sourcegraph' }],
            })

            const uri = getTestURI({ repoName: 'cody', filePath: 'foo/bar.ts' })
            getRepoNameFromWorkspaceUri.mockResolvedValue(undefined)
            expect(await provider.isUriIgnored(uri)).toBe(true)
        })
    })
})
