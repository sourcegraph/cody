import { describe, expect, it } from 'vitest'

import { insertMissingBrackets } from './truncate-parsed-completion'

describe('insertAllMissingBrackets', () => {
    it('handles an empty string', () => {
        expect(insertMissingBrackets('')).toEqual('')
    })

    it('returns original string if brackets are balanced', () => {
        const text = 'function balanced() { return [1, 2, 3]; }'
        expect(insertMissingBrackets(text)).toEqual(text)
    })

    it('inserts missing single type of bracket', () => {
        const text = 'function missingCurly() { return [1, 2, 3;'
        expect(insertMissingBrackets(text)).toEqual(`${text}]}`)
    })

    it('correctly handles nested brackets', () => {
        const text = 'function nested() { if (true) { return [1, 2, 3; '
        expect(insertMissingBrackets(text)).toEqual(`${text}]}}`)
    })

    it('handles mixed types of brackets', () => {
        const text = 'function mixed() { return [1, 2, 3;'
        expect(insertMissingBrackets(text)).toEqual(`${text}]}`)
    })

    it('returns original string if no brackets are present', () => {
        const text = 'function noBrackets() return 123;'
        expect(insertMissingBrackets(text)).toEqual(text)
    })

    it('does not correct incorrectly ordered brackets', () => {
        const text = 'function wrongOrder() } return [1, 2, 3; {'
        expect(insertMissingBrackets(text)).toEqual(`${text}}]`)
    })
})
