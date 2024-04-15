import { type ContextFiltersResult, graphqlClient } from '@sourcegraph/cody-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import * as repoHelpers from '../repository/repositoryHelpers'
import { ContextFiltersProvider } from './context-filters-provider'

describe('ContextFiltersProvider', () => {
    let provider: ContextFiltersProvider

    beforeEach(() => {
        provider = new ContextFiltersProvider()
        vi.useFakeTimers()
    })

    afterEach(() => {
        provider.dispose()
        vi.restoreAllMocks()
    })

    async function initProviderWithContextFilters(contextFilters: ContextFiltersResult): Promise<void> {
        vi.spyOn(graphqlClient, 'contextFilters').mockResolvedValue(contextFilters)
        await provider.init()
    }

    interface AssertFilters {
        label: string
        filters: ContextFiltersResult
        allowed?: [string, string][]
        notAllowed?: [string, string][]
    }

    describe('isPathAllowed', () => {
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
            {
                label: 'matches file path patterns correctly',
                filters: {
                    include: [
                        {
                            repoNamePattern: '^github\\.com\\/sourcegraph\\/.*',
                            filePathPatterns: ['.*\\.ts$'],
                        },
                    ],
                    exclude: [],
                },
                allowed: [['github.com/sourcegraph/cody', 'src/main.ts']],
                notAllowed: [['github.com/sourcegraph/cody', 'src/main.js']],
            },
        ])('$label', async ({ filters, allowed = [], notAllowed = [] }) => {
            await initProviderWithContextFilters(filters)

            for (const allowedItem of allowed) {
                expect(provider.isPathAllowed(...allowedItem)).toBe(true)
            }

            for (const notAllowedItem of notAllowed) {
                expect(provider.isPathAllowed(...notAllowedItem)).toBe(false)
            }
        })

        it('exclude everything on unknown API errors', async () => {
            vi.spyOn(graphqlClient, 'contextFilters').mockResolvedValue(new Error('API error message'))
            await provider.init()

            expect(provider.isPathAllowed('github.com/sourcegraph/whatever', 'src/main.ts')).toBe(false)
        })

        it('exclude everything on network errors', async () => {
            vi.spyOn(graphqlClient, 'contextFilters').mockRejectedValue(new Error('network error'))
            await provider.init()

            expect(provider.isPathAllowed('github.com/sourcegraph/whatever', 'src/main.ts')).toBe(false)
        })

        it('uses cached results for repeated calls', async () => {
            const contextFilters = {
                include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' }],
                exclude: [],
            }

            const mockedApiRequest = vi
                .spyOn(graphqlClient, 'contextFilters')
                .mockResolvedValue(contextFilters)

            await provider.init()

            expect(provider.isPathAllowed('github.com/sourcegraph/cody', 'src/main.ts')).toBe(true)
            expect(provider.isPathAllowed('github.com/sourcegraph/cody', 'src/main.ts')).toBe(true)
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
                .spyOn(graphqlClient, 'contextFilters')
                .mockResolvedValueOnce(mockContextFilters1)
                .mockResolvedValueOnce(mockContextFilters2)
            await provider.init()

            expect(mockedApiRequest).toBeCalledTimes(1)
            expect(provider.isPathAllowed('github.com/sourcegraph/cody', 'src/main.ts')).toBe(true)

            await vi.runOnlyPendingTimersAsync()

            expect(mockedApiRequest).toBeCalledTimes(2)
            expect(provider.isPathAllowed('github.com/sourcegraph/cody', 'src/main.ts')).toBe(false)
            expect(provider.isPathAllowed('github.com/other/cody', 'src/main.ts')).toBe(true)
        })
    })

    describe('isUriAllowed', () => {
        interface TestUriParams {
            repoName: string
            filePath: string
        }

        function getTestURI(params: TestUriParams): URI {
            const { repoName, filePath } = params

            vi.spyOn(repoHelpers, 'getCodebaseFromWorkspaceUriAsync').mockResolvedValue(
                `github.com/sourcegraph/${repoName}`
            )

            vi.spyOn(vscode.workspace, 'asRelativePath').mockReturnValue(filePath)

            return URI.file(`/${repoName}/${filePath}`)
        }

        it('works', async () => {
            await initProviderWithContextFilters({
                include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/cody' }],
                exclude: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/sourcegraph' }],
            })

            const includedURI = getTestURI({ repoName: 'cody', filePath: 'foo/bar.ts' })
            expect(includedURI.fsPath.replaceAll('\\', '/')).toBe('/cody/foo/bar.ts')
            expect(await repoHelpers.getCodebaseFromWorkspaceUriAsync(includedURI)).toBe(
                'github.com/sourcegraph/cody'
            )

            expect(await provider.isUriAllowed(includedURI)).toBe(true)

            const excludedURI = getTestURI({ repoName: 'sourcegraph', filePath: 'src/main.tsx' })
            expect(excludedURI.fsPath).toBe('/sourcegraph/src/main.tsx')
            expect(await repoHelpers.getCodebaseFromWorkspaceUriAsync(excludedURI)).toBe(
                'github.com/sourcegraph/sourcegraph'
            )

            expect(await provider.isUriAllowed(excludedURI)).toBe(false)
        })
    })
})
