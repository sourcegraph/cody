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
        allowed?: [string, string][]
        notAllowed?: [string, string][]
    }

    describe('isRepoNameAllowed', () => {
        it.each<AssertFilters>([
            {
                label: 'allows everything if both include and exclude are empty',
                filters: {
                    include: [],
                    exclude: [],
                },
                allowed: [
                    ['github.com/sourcegraph/cody', 'src/main.ts'],
                    ['github.com/evilcorp/cody', 'src/main.ts'],
                ],
                notAllowed: [],
            },
            {
                label: 'only include rules',
                filters: {
                    include: [{ repoNamePattern: '.*non-sensitive.*' }],
                    exclude: [],
                },
                allowed: [
                    ['github.com/sourcegraph/non-sensitive', 'src/main.ts'],
                    ['github.com/non-sensitive/cody', 'agent/readme.md'],
                ],
                notAllowed: [['github.com/sensitive/whatever', 'src/main.ts']],
            },
            {
                label: 'only exclude rules',
                filters: {
                    include: [],
                    exclude: [{ repoNamePattern: '.*sensitive.*' }],
                },
                allowed: [
                    ['github.com/sourcegraph/whatever', 'src/main.ts'],
                    ['github.com/sourcegraph/cody', 'agent/readme.md'],
                ],
                notAllowed: [['github.com/sensitive/whatever', 'src/main.ts']],
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
                allowed: [
                    ['github.com/sourcegraph/cody', 'src/main.ts'],
                    ['github.com/evilcorp/cody', 'src/main.ts'],
                ],
                notAllowed: [['github.com/sensitive/whatever', 'src/main.ts']],
            },
            {
                label: 'does not allow a repo if it does not match the include pattern',
                filters: {
                    include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' }],
                    exclude: [{ repoNamePattern: '.*sensitive.*' }],
                },
                notAllowed: [['github.com/other/repo', 'src/main.ts']],
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
                allowed: [['github.com/sourcegraph/cody', 'src/main.ts']],
                notAllowed: [
                    ['github.com/sensitive/sensitive-repo', 'src/main.ts'],
                    ['github.com/sourcegraph/not-allowed-repo', 'src/main.ts'],
                ],
            },
            {
                label: 'excludes repos that match both include and exclude patterns',
                filters: {
                    include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' }],
                    exclude: [{ repoNamePattern: '.*sensitive.*' }],
                },
                notAllowed: [['github.com/sourcegraph/sensitive-repo', 'src/main.ts']],
            },
            {
                label: 'excludes repos with anchored exclude pattern starting with the specific term',
                filters: {
                    include: [{ repoNamePattern: 'github\\.com\\/sourcegraph\\/.*' }],
                    exclude: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/sensitive.*' }],
                },
                notAllowed: [['github.com/sourcegraph/sensitive-data', 'src/main.ts']],
                allowed: [
                    ['company.github.com/sourcegraph/sensitive-data', 'src/main.ts'],
                    ['github.com/sourcegraph/general', 'src/main.ts'],
                ],
            },
            {
                label: 'excludes repos with anchored exclude pattern ending with the specific term',
                filters: {
                    include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' }],
                    exclude: [{ repoNamePattern: '.*\\/sensitive$' }],
                },
                allowed: [['github.com/sourcegraph/data-sensitive', 'src/main.ts']],
                notAllowed: [['github.com/sourcegraph/sensitive', 'src/main.ts']],
            },
            {
                label: 'excludes repos using non-capturing groups',
                filters: {
                    include: [{ repoNamePattern: '^github\\.com\\/(sourcegraph|evilcorp)\\/.*' }],
                    exclude: [{ repoNamePattern: '.*\\/(sensitive|classified).*' }],
                },
                notAllowed: [['github.com/sourcegraph/sensitive-project', 'src/main.ts']],
                allowed: [['github.com/evilcorp/public', 'src/main.ts']],
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
                    ['github.com/sourcegraph/about', ''],
                    ['github.com/sourcegraph/annotate', ''],
                    ['github.com/sourcegraph/sourcegraph', ''],
                    ['github.com/facebook/react', ''],
                ],
                notAllowed: [
                    ['github.com/docker/compose', ''],
                    ['github.com/sourcegraph/cody', ''],
                ],
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
                notAllowed: [
                    ['github.com/sourcegraph/about', ''],
                    ['github.com/sourcegraph/annotate', ''],
                    ['github.com/sourcegraph/sourcegraph', ''],
                    ['github.com/facebook/react', ''],
                    ['github.com/docker/compose', ''],
                    ['github.com/sourcegraph/cody', ''],
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
                notAllowed: [['github.com/sourcegraph/cody', 'src/main.ts']],
            },
        ])('$label', async ({ filters, allowed = [], notAllowed = [] }) => {
            await initProviderWithContextFilters(filters)

            for (const [repoName] of allowed) {
                expect(provider.isRepoNameAllowed(repoName)).toBe(true)
            }

            for (const [repoName] of notAllowed) {
                expect(provider.isRepoNameAllowed(repoName)).toBe(false)
            }
        })

        it('excludes everything on network errors', async () => {
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockRejectedValue(new Error('network error'))
            await provider.init(getRepoNameFromWorkspaceUri)

            expect(provider.isRepoNameAllowed('github.com/sourcegraph/whatever')).toBe(false)
        })

        it('excludes everything on unknown API errors', async () => {
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue(
                new Error('API error message')
            )
            await provider.init(getRepoNameFromWorkspaceUri)

            expect(provider.isRepoNameAllowed('github.com/sourcegraph/whatever')).toBe(false)
        })

        it('excludes everything on invalid response structure', async () => {
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue({
                data: { site: { codyContextFilters: { raw: { something: true } } } },
            })
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue(
                new Error('API error message')
            )
            await provider.init(getRepoNameFromWorkspaceUri)

            expect(provider.isRepoNameAllowed('github.com/sourcegraph/whatever')).toBe(false)
        })

        it('includes everything on empty responses', async () => {
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue({
                data: { site: { codyContextFilters: { raw: null } } },
            })
            await provider.init(getRepoNameFromWorkspaceUri)

            expect(provider.isRepoNameAllowed('github.com/sourcegraph/whatever')).toBe(true)
        })

        it('includes everything on for Sourcegraph API without context filters support', async () => {
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue(
                new Error('Error: Cannot query field `codyContextFilters`')
            )
            await provider.init(getRepoNameFromWorkspaceUri)

            expect(provider.isRepoNameAllowed('github.com/sourcegraph/whatever')).toBe(true)
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

            expect(provider.isRepoNameAllowed('github.com/sourcegraph/cody')).toBe(true)
            expect(provider.isRepoNameAllowed('github.com/sourcegraph/cody')).toBe(true)
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
            expect(provider.isRepoNameAllowed('github.com/sourcegraph/cody')).toBe(true)

            await vi.runOnlyPendingTimersAsync()

            expect(mockedApiRequest).toBeCalledTimes(2)
            expect(provider.isRepoNameAllowed('github.com/sourcegraph/cody')).toBe(false)
            expect(provider.isRepoNameAllowed('github.com/other/cody')).toBe(true)
        })
    })

    describe('isUriAllowed', () => {
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

            expect(await provider.isUriAllowed(includedURI)).toBe(true)

            const excludedURI = getTestURI({ repoName: 'sourcegraph', filePath: 'src/main.tsx' })
            expect(excludedURI.fsPath.replaceAll('\\', '/')).toBe('/sourcegraph/src/main.tsx')
            expect(await getRepoNameFromWorkspaceUri(excludedURI)).toBe(
                'github.com/sourcegraph/sourcegraph'
            )

            expect(await provider.isUriAllowed(excludedURI)).toBe(false)
        })

        it('returns `false` if repo name is not found', async () => {
            await initProviderWithContextFilters({
                include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/cody' }],
                exclude: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/sourcegraph' }],
            })

            const uri = getTestURI({ repoName: 'cody', filePath: 'foo/bar.ts' })
            getRepoNameFromWorkspaceUri.mockResolvedValue(undefined)
            expect(await provider.isUriAllowed(uri)).toBe(false)
        })
    })
})
