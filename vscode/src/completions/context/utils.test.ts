import { describe, expect, it } from 'vitest'

import { shouldBeUsedAsContext } from './utils'

describe('shouldBeUsedAsContext', () => {
    describe('without extended language pool', () => {
        it('returns true for the same language', () => {
            expect(
                shouldBeUsedAsContext({
                    baseLanguageId: 'javascript',
                    languageId: 'javascript',
                })
            ).toBe(true)
        })

        it('allows js as context for jsx and vice versa', () => {
            expect(
                shouldBeUsedAsContext({
                    baseLanguageId: 'javascript',
                    languageId: 'javascriptreact',
                })
            ).toBe(true)
            expect(
                shouldBeUsedAsContext({
                    baseLanguageId: 'javascriptreact',
                    languageId: 'javascript',
                })
            ).toBe(true)
        })

        it('allows ts as context for tsx and vice versa', () => {
            expect(
                shouldBeUsedAsContext({
                    baseLanguageId: 'typescript',
                    languageId: 'typescriptreact',
                })
            ).toBe(true)
            expect(
                shouldBeUsedAsContext({
                    baseLanguageId: 'typescriptreact',
                    languageId: 'typescript',
                })
            ).toBe(true)
        })
    })
})
