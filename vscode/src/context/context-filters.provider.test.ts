import { type ContextFiltersResult, graphqlClient } from '@sourcegraph/cody-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

    it('allows a path if it matches the include pattern and does not match the exclude pattern', async () => {
        await initProviderWithContextFilters({
            include: [
                { repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' },
                { repoNamePattern: '^github\\.com\\/evilcorp\\/.*' },
            ],
            exclude: [{ repoNamePattern: '.*sensitive.*' }],
        })

        expect(provider.isPathAllowed('github.com/sourcegraph/cody', 'src/main.ts')).toBe(true)
        expect(provider.isPathAllowed('github.com/evilcorp/cody', 'src/main.ts')).toBe(true)
    })

    it('does not allow a path if it does not match the include pattern', async () => {
        await initProviderWithContextFilters({
            include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' }],
            exclude: [{ repoNamePattern: '.*sensitive.*' }],
        })

        expect(provider.isPathAllowed('github.com/other/repo', 'src/main.ts')).toBe(false)
    })

    it('does not allow a path if it matches the exclude pattern', async () => {
        await initProviderWithContextFilters({
            include: [
                { repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' },
                { repoNamePattern: '^github\\.com\\/sensitive\\/.*' },
            ],
            exclude: [{ repoNamePattern: '.*sensitive.*' }, { repoNamePattern: '.*not-allowed.*' }],
        })

        expect(provider.isPathAllowed('github.com/sensitive/sensitive-repo', 'src/main.ts')).toBe(false)
        expect(provider.isPathAllowed('github.com/sourcegraph/not-allowed-repo', 'src/main.ts')).toBe(
            false
        )
    })

    it('allows any path if include is empty and it does not match the exclude pattern', async () => {
        await initProviderWithContextFilters({
            include: [],
            exclude: [{ repoNamePattern: '.*sensitive.*' }],
        })

        expect(provider.isPathAllowed('github.com/sourcegraph/whatever', 'src/main.ts')).toBe(true)
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

    it('matches file path patterns correctly', async () => {
        await initProviderWithContextFilters({
            include: [
                { repoNamePattern: '^github\\.com\\/sourcegraph\\/.*', filePathPatterns: ['.*\\.ts$'] },
            ],
            exclude: [],
        })

        expect(provider.isPathAllowed('github.com/sourcegraph/cody', 'src/main.ts')).toBe(true)
        expect(provider.isPathAllowed('github.com/sourcegraph/cody', 'src/main.js')).toBe(false)
    })

    it('excludes paths that match both include and exclude patterns', async () => {
        await initProviderWithContextFilters({
            include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' }],
            exclude: [{ repoNamePattern: '.*sensitive.*' }],
        })

        expect(provider.isPathAllowed('github.com/sourcegraph/sensitive-repo', 'src/main.ts')).toBe(
            false
        )
    })

    it('handles invalid regular expressions gracefully', async () => {
        await initProviderWithContextFilters({
            include: [
                { repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' },
                { repoNamePattern: '(invalid_regex' },
            ],
            exclude: [],
        })

        expect(provider.isPathAllowed('github.com/sourcegraph/cody', 'src/main.ts')).toBe(false)
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
