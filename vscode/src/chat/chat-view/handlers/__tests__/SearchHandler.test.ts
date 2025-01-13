import { describe, expect, it } from 'vitest'
import { escapeNLSQuery } from '../SearchHandler'

describe('escapeNLSQuery', () => {
    it('escapes backslashes', () => {
        expect(escapeNLSQuery('path\\to\\file')).toBe('path\\\\to\\\\file')
    })

    it('escapes double quotes', () => {
        expect(escapeNLSQuery(`say "hello"`)).toBe(`say \\"hello\\"`)
    })

    it('escapes escaped quotes', () => {
        expect(escapeNLSQuery(`c:\\path\\"file"`)).toBe(`c:\\\\path\\\\\\"file\\"`)
    })
})
