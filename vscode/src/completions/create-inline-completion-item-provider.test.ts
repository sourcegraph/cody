import { describe, expect, it } from 'vitest'

import { getInlineCompletionItemProviderFilters } from './create-inline-completion-item-provider'

describe('getInlineCompletionItemProviderFilters', () => {
    it('returns correct language filters if wildcard is true', async () => {
        const filters = await getInlineCompletionItemProviderFilters({
            '*': true,
            go: false,
        })

        const enabledLanguages = filters.map(f => f.language)

        expect(enabledLanguages).not.include('go')
        expect(enabledLanguages).include('typescript')
        expect(enabledLanguages).include('javascript')
    })

    it('returns correct language filters if wildcard is false', async () => {
        const filters = await getInlineCompletionItemProviderFilters({
            '*': false,
            go: true,
            typescript: true,
            rust: false,
            scminput: true,
        })

        const enabledLanguages = filters.map(f => f.language)

        expect(enabledLanguages).toEqual(['go', 'typescript'])
    })
})
