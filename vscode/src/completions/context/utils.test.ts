import { describe, expect, it } from 'vitest'
import { shouldBeUsedAsContext } from './utils'

describe('shouldBeUsedAsContext', () => {
    describe('without extended language pool', () => {
        it('returns true for the same language', () => {
            expect(
                shouldBeUsedAsContext({
                    enableExtendedLanguagePool: false,
                    baseLanguageId: 'javascript',
                    languageId: 'javascript',
                })
            ).toBe(true)
        })

        it('allows js as context for jsx and vice versa', () => {
            expect(
                shouldBeUsedAsContext({
                    enableExtendedLanguagePool: false,
                    baseLanguageId: 'javascript',
                    languageId: 'javascriptreact',
                })
            ).toBe(true)
            expect(
                shouldBeUsedAsContext({
                    enableExtendedLanguagePool: false,
                    baseLanguageId: 'javascriptreact',
                    languageId: 'javascript',
                })
            ).toBe(true)
        })

        it('allows ts as context for tsx and vice versa', () => {
            expect(
                shouldBeUsedAsContext({
                    enableExtendedLanguagePool: false,
                    baseLanguageId: 'typescript',
                    languageId: 'typescriptreact',
                })
            ).toBe(true)
            expect(
                shouldBeUsedAsContext({
                    enableExtendedLanguagePool: false,
                    baseLanguageId: 'typescriptreact',
                    languageId: 'typescript',
                })
            ).toBe(true)
        })
    })

    describe('with extended language pool', () => {
        it('allows css files as context for template languages', () => {
            expect(
                shouldBeUsedAsContext({
                    enableExtendedLanguagePool: true,
                    baseLanguageId: 'typescriptreact',
                    languageId: 'scss',
                })
            ).toBe(true)
            expect(
                shouldBeUsedAsContext({
                    enableExtendedLanguagePool: true,
                    baseLanguageId: 'javascriptreact',
                    languageId: 'less',
                })
            ).toBe(true)
            expect(
                shouldBeUsedAsContext({
                    enableExtendedLanguagePool: true,
                    baseLanguageId: 'handlebars',
                    languageId: 'css',
                })
            ).toBe(true)
        })

        it('allows template languages to be used as context for css files', () => {
            expect(
                shouldBeUsedAsContext({
                    enableExtendedLanguagePool: true,
                    baseLanguageId: 'scss',
                    languageId: 'typescriptreact',
                })
            ).toBe(true)
            expect(
                shouldBeUsedAsContext({
                    enableExtendedLanguagePool: true,
                    baseLanguageId: 'less',
                    languageId: 'javascriptreact',
                })
            ).toBe(true)
            expect(
                shouldBeUsedAsContext({
                    enableExtendedLanguagePool: true,
                    baseLanguageId: 'css',
                    languageId: 'handlebars',
                })
            ).toBe(true)
        })
    })
})
