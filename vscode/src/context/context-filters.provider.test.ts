import { graphqlClient } from '@sourcegraph/cody-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextFiltersProvider } from './context-filters-provider'

describe('ContextFiltersProvider', () => {
    let provider: ContextFiltersProvider

    beforeEach(() => {
        provider = new ContextFiltersProvider()
    })

    afterEach(() => {
        provider.dispose()
        vi.restoreAllMocks()
    })

    it('allows a path if it matches the include pattern and does not match the exclude pattern', async () => {
        const mockContextFilters = {
            include: [
                { repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' },
                { repoNamePattern: '^github\\.com\\/evilcorp\\/.*' },
            ],
            exclude: [{ repoNamePattern: '.*sensitive.*' }],
        }
        vi.spyOn(graphqlClient, 'contextFilters').mockResolvedValue(mockContextFilters)
        await provider.init()

        const isAllowed = provider.isPathAllowed('github.com/sourcegraph/cody', 'src/main.ts')
        const isAllowed2 = provider.isPathAllowed('github.com/evilcorp/cody', 'src/main.ts')
        expect(isAllowed).toBe(true)
        expect(isAllowed2).toBe(true)
    })

    it('does not allow a path if it does not match the include pattern', async () => {
        const mockContextFilters = {
            include: [{ repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' }],
            exclude: [{ repoNamePattern: '.*sensitive.*' }],
        }
        vi.spyOn(graphqlClient, 'contextFilters').mockResolvedValue(mockContextFilters)
        await provider.init()

        const isAllowed = provider.isPathAllowed('github.com/other/repo', 'src/main.ts')
        expect(isAllowed).toBe(false)
    })

    it('does not allow a path if it matches the exclude pattern', async () => {
        const mockContextFilters = {
            include: [
                { repoNamePattern: '^github\\.com\\/sourcegraph\\/.*' },
                { repoNamePattern: '^github\\.com\\/sensitive\\/.*' },
            ],
            exclude: [{ repoNamePattern: '.*sensitive.*' }, { repoNamePattern: '.*not-allowed.*' }],
        }
        vi.spyOn(graphqlClient, 'contextFilters').mockResolvedValue(mockContextFilters)
        await provider.init()

        const isAllowed = provider.isPathAllowed('github.com/sensitive/sensitive-repo', 'src/main.ts')
        const isAllowed2 = provider.isPathAllowed(
            'github.com/sourcegraph/not-allowed-repo',
            'src/main.ts'
        )

        expect(isAllowed).toBe(false)
        expect(isAllowed2).toBe(false)
    })

    it('allows any path if include is empty and it does not match the exclude pattern', async () => {
        const mockContextFilters = {
            include: [],
            exclude: [{ repoNamePattern: '.*sensitive.*' }],
        }
        vi.spyOn(graphqlClient, 'contextFilters').mockResolvedValue(mockContextFilters)
        await provider.init()

        const isAllowed = provider.isPathAllowed('github.com/sourcegraph/whatever', 'src/main.ts')
        expect(isAllowed).toBe(true)
    })

    it('exclude everything on unknown API errors', async () => {
        vi.spyOn(graphqlClient, 'contextFilters').mockResolvedValue(new Error('API error message'))
        await provider.init()

        const isAllowed = provider.isPathAllowed('github.com/sourcegraph/whatever', 'src/main.ts')
        expect(isAllowed).toBe(false)
    })

    it('exclude everything on network errors', async () => {
        vi.spyOn(graphqlClient, 'contextFilters').mockRejectedValue(new Error('network error'))
        await provider.init()

        const isAllowed = provider.isPathAllowed('github.com/sourcegraph/whatever', 'src/main.ts')
        expect(isAllowed).toBe(false)
    })
})
