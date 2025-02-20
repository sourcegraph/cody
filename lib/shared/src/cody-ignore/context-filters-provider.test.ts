import sharedTestDataset from '@sourcegraph/cody-context-filters-test-dataset/dataset.json'
import { RE2JS as RE2 } from 're2js'
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { URI } from 'vscode-uri'

import { mockAuthStatus } from '../auth/authStatus'
import { AUTH_STATUS_FIXTURE_AUTHED, AUTH_STATUS_FIXTURE_AUTHED_DOTCOM } from '../auth/types'
import { isDefined } from '../common'
import { mockResolvedConfig } from '../configuration/resolver'
import { DOTCOM_URL } from '../sourcegraph-api/environments'
import {
    type ContextFilters,
    DURABLE_REFETCH_INTERVAL_HINT,
    EXCLUDE_EVERYTHING_CONTEXT_FILTERS,
    TRANSIENT_REFETCH_INTERVAL_HINT,
    graphqlClient,
} from '../sourcegraph-api/graphql/client'
import { ContextFiltersProvider, type GetRepoNamesContainingUri } from './context-filters-provider'

describe('ContextFiltersProvider', () => {
    let provider: ContextFiltersProvider

    let getRepoNamesContainingUri: Mock<GetRepoNamesContainingUri>

    beforeEach(() => {
        mockResolvedConfig({ configuration: {}, auth: { serverEndpoint: 'https://example.com' } })
        mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)
        getRepoNamesContainingUri = vi.fn()
        ContextFiltersProvider.repoNameResolver = { getRepoNamesContainingUri }

        provider = new ContextFiltersProvider()
        vi.useFakeTimers()

        vi.spyOn(graphqlClient, 'getSiteVersion').mockResolvedValue('6.0.0')
    })

    afterEach(() => {
        provider.dispose()
        vi.clearAllTimers()
        vi.restoreAllMocks()
    })

    function apiResponseForFilters(contextFilters: ContextFilters | null) {
        return {
            data: { site: { codyContextFilters: { raw: contextFilters } } },
        }
    }

    async function initProviderWithContextFilters(contextFilters: ContextFilters | null): Promise<void> {
        vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue(
            apiResponseForFilters(contextFilters)
        )
    }

    interface AssertFilters {
        label: string
        filters: ContextFilters
        allowed?: string[]
        ignored?: string[]
    }

    describe('isRepoNameIgnored', () => {
        it.each(sharedTestDataset.testCases)('$name', async testCase => {
            const { repos, includedRepos, fileChunks, includedFileChunks } = testCase
            await initProviderWithContextFilters(testCase['cody.contextFilters'])

            const allowedRepos = (
                await Promise.all(
                    repos.map(async r => ((await provider.isRepoNameIgnored(r.name)) ? null : r))
                )
            ).filter(isDefined)
            expect(allowedRepos).toEqual(includedRepos)

            const allowedFileChunks = (
                await Promise.all(
                    fileChunks.map(async fc =>
                        (await provider.isRepoNameIgnored(fc.repo.name)) ? null : fc
                    )
                )
            ).filter(isDefined)
            expect(allowedFileChunks).toEqual(includedFileChunks)
        })

        it.each<AssertFilters>([
            {
                label: 'allows everything if both include and exclude are empty',
                filters: {
                    include: null,
                    exclude: null,
                },
                allowed: ['github.com/sourcegraph/cody', 'github.com/evilcorp/cody'],
                ignored: [],
            },
            {
                label: 'only include rules',
                filters: {
                    include: [{ repoNamePattern: '.*non-sensitive.*' }],
                },
                allowed: ['github.com/sourcegraph/non-sensitive', 'github.com/non-sensitive/cody'],
                ignored: ['github.com/sensitive/whatever'],
            },
            {
                label: 'only exclude rules',
                filters: {
                    exclude: [{ repoNamePattern: '.*sensitive.*' }],
                },
                allowed: ['github.com/sourcegraph/whatever', 'github.com/sourcegraph/cody'],
                ignored: ['github.com/sensitive/whatever'],
            },
            {
                label: 'include and exclude rules',
                filters: {
                    include: [
                        { repoNamePattern: '^github\\.com/sourcegraph/.*' },
                        { repoNamePattern: '^github\\.com/evilcorp/.*' },
                    ],
                    exclude: [{ repoNamePattern: '.*sensitive.*' }],
                },
                allowed: ['github.com/sourcegraph/cody', 'github.com/evilcorp/cody'],
                ignored: ['github.com/sensitive/whatever'],
            },
            {
                label: 'does not allow a repo if it does not match the include pattern',
                filters: {
                    include: [{ repoNamePattern: '^github\\.com/sourcegraph/.*' }],
                    exclude: [{ repoNamePattern: '.*sensitive.*' }],
                },
                ignored: ['github.com/other/repo'],
            },
            {
                label: 'does not allow a repo if it matches the exclude pattern',
                filters: {
                    include: [
                        { repoNamePattern: '^github\\.com/sourcegraph/.*' },
                        { repoNamePattern: '^github\\.com/sensitive/.*' },
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
                    include: [{ repoNamePattern: '^github\\.com/sourcegraph/.*' }],
                    exclude: [{ repoNamePattern: '.*sensitive.*' }],
                },
                ignored: ['github.com/sourcegraph/sensitive-repo'],
            },
            {
                label: 'excludes repos with anchored exclude pattern starting with the specific term',
                filters: {
                    include: [{ repoNamePattern: 'github\\.com/sourcegraph/.*' }],
                    exclude: [{ repoNamePattern: '^github\\.com/sourcegraph/sensitive.*' }],
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
                    include: [{ repoNamePattern: '^github\\.com/sourcegraph/.*' }],
                    exclude: [{ repoNamePattern: '.*/sensitive$' }],
                },
                allowed: ['github.com/sourcegraph/data-sensitive'],
                ignored: ['github.com/sourcegraph/sensitive'],
            },
            {
                label: 'excludes repos using non-capturing groups',
                filters: {
                    include: [{ repoNamePattern: '^github\\.com/(sourcegraph|evilcorp)/.*' }],
                    exclude: [{ repoNamePattern: '.*/(sensitive|classified).*' }],
                },
                ignored: ['github.com/sourcegraph/sensitive-project'],
                allowed: ['github.com/evilcorp/public'],
            },
            {
                label: 'multiple include and exclude patterns',
                filters: {
                    include: [
                        { repoNamePattern: '^github\\.com/sourcegraph/.+' },
                        { repoNamePattern: '^github\\.com/docker/compose$' },
                        { repoNamePattern: '^github\\.com/.+/react' },
                    ],
                    exclude: [{ repoNamePattern: '.*cody.*' }, { repoNamePattern: '.+/docker/.+' }],
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
                        { repoNamePattern: '^github\\.com/sourcegraph/.+' },
                        { repoNamePattern: '^github\\.com/docker/compose$' },
                        { repoNamePattern: '^github\\.com/.+/react' },
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
                        { repoNamePattern: '^github\\.com/sourcegraph/.*' },
                        { repoNamePattern: '(invalid_regex' },
                    ],
                },
                ignored: ['github.com/sourcegraph/cody'],
            },
        ])('$label', async ({ filters, allowed = [], ignored = [] }) => {
            await initProviderWithContextFilters(filters)

            for (const repoName of allowed) {
                expect(await provider.isRepoNameIgnored(repoName)).toBe(false)
            }

            for (const repoName of ignored) {
                expect(await provider.isRepoNameIgnored(repoName)).toBe(true)
            }
        })

        it('uses cached results for repeated calls', async () => {
            const contextFilters = {
                include: [{ repoNamePattern: '^github\\.com/sourcegraph/.*' }],
            } satisfies ContextFilters

            const mockedApiRequest = vi
                .spyOn(graphqlClient, 'fetchSourcegraphAPI')
                .mockResolvedValue(apiResponseForFilters(contextFilters))

            expect(await provider.isRepoNameIgnored('github.com/sourcegraph/cody')).toBe(false)
            expect(await provider.isRepoNameIgnored('github.com/sourcegraph/cody')).toBe(false)
            expect(mockedApiRequest).toBeCalledTimes(1)
        })

        it('refetches context filters after the specified interval', async () => {
            const mockContextFilters1 = {
                include: [{ repoNamePattern: '^github\\.com/sourcegraph/.*' }],
            } satisfies ContextFilters

            const mockContextFilters2 = {
                include: [{ repoNamePattern: '^github\\.com/other/.*' }],
            } satisfies ContextFilters

            const mockedApiRequest = vi
                .spyOn(graphqlClient, 'fetchSourcegraphAPI')
                .mockResolvedValueOnce(apiResponseForFilters(mockContextFilters1))
                .mockResolvedValueOnce(apiResponseForFilters(mockContextFilters2))

            vi.setSystemTime(new Date(2024, 1, 1, 8, 0))
            await provider.isRepoNameIgnored('anything')
            expect(await provider.isRepoNameIgnored('github.com/sourcegraph/cody')).toBe(false)
            expect(mockedApiRequest).toBeCalledTimes(1)

            vi.setSystemTime(new Date(2024, 1, 1, 9, 1))
            expect(await provider.isRepoNameIgnored('github.com/sourcegraph/cody')).toBe(true)
            expect(await provider.isRepoNameIgnored('github.com/other/cody')).toBe(false)
            expect(mockedApiRequest).toBeCalledTimes(2)
        })
    })

    describe('isUriIgnored', () => {
        interface TestUriParams {
            repoName: string
            filePath: string
        }

        function getTestURI(params: TestUriParams): URI {
            const { repoName, filePath } = params

            getRepoNamesContainingUri.mockResolvedValue([`github.com/sourcegraph/${repoName}`])

            return URI.file(`/${repoName}/${filePath}`)
        }

        it('should handle the case when version is older than the supported version', async () => {
            vi.spyOn(graphqlClient, 'getSiteVersion').mockResolvedValue('5.3.2')
            await initProviderWithContextFilters({
                include: [{ repoNamePattern: '^github\\.com/sourcegraph/cody' }],
                exclude: [{ repoNamePattern: '^github\\.com/sourcegraph/sourcegraph' }],
            })

            const includedURI = getTestURI({ repoName: 'cody', filePath: 'foo/bar.ts' })
            expect(await provider.isUriIgnored(includedURI)).toBe(false)
        })

        it('applies context filters correctly', async () => {
            await initProviderWithContextFilters({
                include: [{ repoNamePattern: '^github\\.com/sourcegraph/cody' }],
                exclude: [{ repoNamePattern: '^github\\.com/sourcegraph/sourcegraph' }],
            })

            const includedURI = getTestURI({ repoName: 'cody', filePath: 'foo/bar.ts' })
            expect(includedURI.fsPath.replaceAll('\\', '/')).toBe('/cody/foo/bar.ts')
            expect(await getRepoNamesContainingUri(includedURI)).toEqual(['github.com/sourcegraph/cody'])

            expect(await provider.isUriIgnored(includedURI)).toBe(false)

            const excludedURI = getTestURI({ repoName: 'sourcegraph', filePath: 'src/main.tsx' })
            expect(excludedURI.fsPath.replaceAll('\\', '/')).toBe('/sourcegraph/src/main.tsx')
            expect(await getRepoNamesContainingUri(excludedURI)).toEqual([
                'github.com/sourcegraph/sourcegraph',
            ])

            expect(await provider.isUriIgnored(excludedURI)).toBe(
                'repo:github.com/sourcegraph/sourcegraph'
            )
        })

        it('returns `no-repo-found` if repo name is not found (undefined)', async () => {
            await initProviderWithContextFilters({
                include: [{ repoNamePattern: '^github\\.com/sourcegraph/cody' }],
                exclude: [{ repoNamePattern: '^github\\.com/sourcegraph/sourcegraph' }],
            })

            const uri = getTestURI({ repoName: 'cody', filePath: 'foo/bar.ts' })
            getRepoNamesContainingUri.mockResolvedValue(null)
            expect(await provider.isUriIgnored(uri)).toBe('no-repo-found')
        })

        it('returns `no-repo-found` if repo name is not found (empty array)', async () => {
            await initProviderWithContextFilters({
                include: [{ repoNamePattern: '^github\\.com/sourcegraph/cody' }],
                exclude: [{ repoNamePattern: '^github\\.com/sourcegraph/sourcegraph' }],
            })

            const uri = getTestURI({ repoName: 'cody', filePath: 'foo/bar.ts' })
            getRepoNamesContainingUri.mockResolvedValue([])
            expect(await provider.isUriIgnored(uri)).toBe('no-repo-found')
        })

        it('allows repos, even if the repo name is not found, when inclusive context filters are set', async () => {
            await initProviderWithContextFilters({
                include: [{ repoNamePattern: '.*' }],
                exclude: null,
            })

            const uri = getTestURI({ repoName: 'cody', filePath: 'foo/bar.ts' })
            getRepoNamesContainingUri.mockResolvedValue([])
            expect(await provider.isUriIgnored(uri)).toBe(false)
        })

        it('excludes everything on network errors', async () => {
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockRejectedValue(new Error('network error'))

            const uri = getTestURI({ repoName: 'whatever', filePath: 'foo/bar.ts' })
            expect(await provider.isUriIgnored(uri)).toBe('repo:github.com/sourcegraph/whatever')
        })

        it(
            'includes everything on dotcom when initial fetch is not complete',
            { timeout: 1000 },
            async () => {
                const foreverPromise = new Promise(() => {}) // We will never resolve this
                vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockReturnValue(foreverPromise)
                mockResolvedConfig({
                    configuration: {},
                    auth: { serverEndpoint: DOTCOM_URL.toString() },
                })
                mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED_DOTCOM)
                provider = new ContextFiltersProvider()
                await provider.isRepoNameIgnored('anything')

                const uri = getTestURI({ repoName: 'whatever', filePath: 'foo/bar.ts' })
                expect(await provider.isUriIgnored(uri)).toBe(false)
            }
        )

        it('excludes everything on unknown API errors', async () => {
            const error = new Error('API error message')
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue(error)

            const uri = getTestURI({ repoName: 'whatever', filePath: 'foo/bar.ts' })
            expect(await provider.isUriIgnored(uri)).toBe(error)
        })

        it('excludes everything on invalid response structure', async () => {
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue({
                data: { site: { codyContextFilters: { raw: { something: true } } } },
            })

            const error = new Error('API error message')
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue(error)

            const uri = getTestURI({ repoName: 'cody', filePath: 'foo/bar.ts' })
            expect(await provider.isUriIgnored(uri)).toBe(error)
        })

        it('includes everything on empty responses', async () => {
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue({
                data: { site: { codyContextFilters: { raw: null } } },
            })

            const uri = getTestURI({ repoName: 'cody', filePath: 'foo/bar.ts' })
            expect(await provider.isUriIgnored(uri)).toBe(false)
        })

        it('includes everything for Sourcegraph API without context filters support', async () => {
            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockResolvedValue(
                new Error('Error: Cannot query field `codyContextFilters`')
            )

            const uri = getTestURI({ repoName: 'cody', filePath: 'foo/bar.ts' })
            expect(await provider.isUriIgnored(uri)).toBe(false)
        })

        it('switches to a short refresh interval for network errors', async () => {
            const longDelay = 60 * 60 * 1000
            const shortDelay = 7 * 1000

            vi.setSystemTime(new Date(2024, 1, 1, 8, 0))
            const apiSpy = vi.spyOn(graphqlClient, 'fetchSourcegraphAPI')
            apiSpy.mockResolvedValueOnce(apiResponseForFilters(null))
            await provider.isRepoNameIgnored('anything')
            expect(provider.timerStateForTest.delay).toEqual(longDelay)
            expect(await provider.timerStateForTest.lifetime).toEqual(DURABLE_REFETCH_INTERVAL_HINT)

            // Start causing errors, check we flip to a short delay regime.
            vi.setSystemTime(new Date(2024, 1, 1, 9, 1))
            apiSpy.mockRejectedValueOnce(new Error('network error'))
            await provider.isRepoNameIgnored('anything')
            expect(provider.timerStateForTest.delay).toEqual(shortDelay)
            expect(await provider.timerStateForTest.lifetime).toEqual(TRANSIENT_REFETCH_INTERVAL_HINT)

            // Errors continue, check we do exponential backoff.
            vi.setSystemTime(new Date(2024, 1, 1, 9, 2))
            apiSpy.mockRejectedValueOnce(new Error('network error'))
            await provider.isRepoNameIgnored('anything')
            expect(provider.timerStateForTest.delay).toBeGreaterThan(shortDelay)

            // Fetch successfully (a "no filters set" result). Should flip to large interval.
            vi.setSystemTime(new Date(2024, 1, 1, 9, 3))
            apiSpy.mockResolvedValueOnce(apiResponseForFilters(null))
            await provider.isRepoNameIgnored('anything')
            expect(provider.timerStateForTest.delay).toEqual(longDelay)
            expect(await provider.timerStateForTest.lifetime).toEqual(DURABLE_REFETCH_INTERVAL_HINT)

            vi.setSystemTime(new Date(2024, 1, 1, 10, 4))
            // Check there's no back-off for the long interval successful results.
            apiSpy.mockResolvedValueOnce(apiResponseForFilters(null))
            await provider.isRepoNameIgnored('anything')
            expect(provider.timerStateForTest.delay).toEqual(longDelay)
            expect(await provider.timerStateForTest.lifetime).toEqual(DURABLE_REFETCH_INTERVAL_HINT)
        })

        it('does not block remote context/http(s) URIs', async () => {
            await initProviderWithContextFilters({
                include: [{ repoNamePattern: '^github\\.com/sourcegraph/cody' }],
                exclude: [{ repoNamePattern: '^github\\.com/sourcegraph/sourcegraph' }],
            })
            expect(
                await provider.isUriIgnored(URI.parse('https://sourcegraph.sourcegraph.com/foo/bar'))
            ).toBe(false)
            expect(await provider.isUriIgnored(URI.parse('http://[::1]/goodies'))).toBe(false)
        })

        it('deny all filters should not block http/s URIs', async () => {
            await initProviderWithContextFilters(EXCLUDE_EVERYTHING_CONTEXT_FILTERS)
            expect(
                await provider.isUriIgnored(URI.parse('https://sourcegraph.sourcegraph.com/foo/bar'))
            ).toBe(false)
            expect(await provider.isUriIgnored(URI.parse('http://[::1]/goodies'))).toBe(false)
        })
    })

    describe('onFiltersChanged', () => {
        it('calls callback on filter updates', async () => {
            const mockContextFilters1 = {
                include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' }],
            } satisfies ContextFilters

            const mockContextFilters2 = {
                include: [{ repoNamePattern: '^github\\.com\\/other\\/.*' }],
            } satisfies ContextFilters

            vi.spyOn(graphqlClient, 'fetchSourcegraphAPI')
                .mockResolvedValueOnce(apiResponseForFilters(mockContextFilters1))
                .mockResolvedValueOnce(apiResponseForFilters(mockContextFilters1))
                .mockResolvedValueOnce(apiResponseForFilters(mockContextFilters2))
                .mockResolvedValueOnce(apiResponseForFilters(mockContextFilters1))

            const onChangeCallback = vi.fn()

            vi.setSystemTime(new Date(2024, 1, 1, 8, 0))

            const dispose = provider.onContextFiltersChanged(onChangeCallback)
            await provider.isRepoNameIgnored('anything')

            // Got the initial value, the callback is called once.
            expect(onChangeCallback).toBeCalledTimes(1)
            expect(onChangeCallback).toBeCalledWith(mockContextFilters1)

            vi.setSystemTime(new Date(2024, 1, 1, 9, 1))
            await provider.isRepoNameIgnored('anything')

            // Nothing changed, so we do not expect the callback to be called.
            expect(onChangeCallback).toBeCalledTimes(1)

            vi.setSystemTime(new Date(2024, 1, 1, 10, 2))
            await provider.isRepoNameIgnored('anything')

            // The value was updated, the callback should be called for the second time.
            expect(onChangeCallback).toBeCalledTimes(2)
            expect(onChangeCallback).toBeCalledWith(mockContextFilters2)

            vi.setSystemTime(new Date(2024, 1, 1, 11, 3))

            dispose()

            // Even though the value changed, we already unsubscribed, so the callback is not called.
            expect(onChangeCallback).toBeCalledTimes(2)
        })
    })
})

describe('RE2JS', () => {
    it('exhibits RE2 u (unicode) flag behavior without the flag being explicitly set', () => {
        // This is the behavior of the 'u' flag as documented at
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/unicode#description:
        //
        // > Surrogate pairs will be interpreted as whole characters instead of two separate
        // > characters. For example, /[😄]/u would only match "😄" but not "\ud83d".
        const re = RE2.compile('[😄]')
        expect(re.matches('😄')).toBe(true)
        expect(re.matches('\ud83d')).toBe(false)
    })
})
