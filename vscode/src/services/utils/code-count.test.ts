import { describe, expect, it } from 'vitest'

import { countCode, matchCodeSnippets } from './code-count'

describe('countCode', () => {
    it('counts lines correctly', () => {
        const code = `line1
  line2
  line3`
        const result = countCode(code)
        expect(result.lineCount).toBe(3)
    })

    it('counts characters correctly', () => {
        const code = 'foo bar'
        const result = countCode(code)
        expect(result.charCount).toBe(7)
    })

    it('handles windows line endings', () => {
        const code = 'line1\r\nline2\r\nline3'
        const result = countCode(code)
        expect(result.lineCount).toBe(3)
    })

    it('handles empty string', () => {
        const code = ''
        const result = countCode(code)
        expect(result.lineCount).toBe(1)
        expect(result.charCount).toBe(0)
    })
})

describe('matchCodeSnippets', () => {
    it('returns false if either input is empty', () => {
        expect(matchCodeSnippets('', 'foo')).toBe(false)
        expect(matchCodeSnippets('foo', '')).toBe(false)
    })

    it('returns true if inputs match without whitespace', () => {
        const copied = 'foo\nbar'
        const changed = 'foobar'
        expect(matchCodeSnippets(copied, changed)).toBe(true)
    })

    it('returns false if inputs do not match without whitespace', () => {
        const copied = 'foo\nbar'
        const changed = 'foobaz'
        expect(matchCodeSnippets(copied, changed)).toBe(false)
    })

    it('handles trailing whitespace correctly', () => {
        const copied = 'foo '
        const changed = 'foo'
        expect(matchCodeSnippets(copied, changed)).toBe(true)
    })
})
