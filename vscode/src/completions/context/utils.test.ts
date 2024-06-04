import { describe, expect, it } from 'vitest'
import { shouldBeUsedAsContext } from './utils'

describe('shouldBeUsedAsContext', () => {
    describe('without extended language pool', () => {
        it('returns true for the same language', () => {
            expect(shouldBeUsedAsContext(false, 'erlang', 'erlang')).toBe(true)
        })

        it('allows js as context for jsx and vice versa', () => {
            expect(shouldBeUsedAsContext(false, 'javascript', 'javascriptreact')).toBe(true)
            expect(shouldBeUsedAsContext(false, 'javascriptreact', 'javascript')).toBe(true)
        })

        it('allows ts as context for tsx and vice versa', () => {
            expect(shouldBeUsedAsContext(false, 'typescript', 'typescriptreact')).toBe(true)
            expect(shouldBeUsedAsContext(false, 'typescriptreact', 'typescript')).toBe(true)
        })
    })

    describe('with extended language pool', () => {
        it('allows css files as context for template languages', () => {
            expect(shouldBeUsedAsContext(true, 'typescriptreact', 'scss')).toBe(true)
            expect(shouldBeUsedAsContext(true, 'javascriptreact', 'less')).toBe(true)
            expect(shouldBeUsedAsContext(true, 'handlebars', 'css')).toBe(true)
        })

        it('allows template languages to be used as context for css files', () => {
            expect(shouldBeUsedAsContext(true, 'scss', 'typescriptreact')).toBe(true)
            expect(shouldBeUsedAsContext(true, 'less', 'javascriptreact')).toBe(true)
            expect(shouldBeUsedAsContext(true, 'css', 'handlebars')).toBe(true)
        })
    })
})
