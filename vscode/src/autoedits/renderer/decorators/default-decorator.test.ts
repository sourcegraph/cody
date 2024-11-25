import { describe, expect, it } from 'vitest'
import { _replaceLeadingTrailingChars } from './default-decorator'

describe('replaceLeadingTrailingChars', () => {
    it('replaces leading and trailing spaces with tabs', () => {
        expect(_replaceLeadingTrailingChars('  hello  ', ' ', '\t')).toBe('\t\thello\t\t')
    })

    it('handles empty string', () => {
        expect(_replaceLeadingTrailingChars('', ' ', '\t')).toBe('')
    })

    it('handles string with no characters to replace', () => {
        expect(_replaceLeadingTrailingChars('hello', ' ', '\t')).toBe('hello')
    })

    it('handles string with all replaceable characters', () => {
        expect(_replaceLeadingTrailingChars('   ', ' ', '-')).toBe('---')
    })

    it('replaces only leading characters', () => {
        expect(_replaceLeadingTrailingChars('  hello', ' ', '\t')).toBe('\t\thello')
    })

    it('replaces only trailing characters', () => {
        expect(_replaceLeadingTrailingChars('hello  ', ' ', '\t')).toBe('hello\t\t')
    })

    it('handles different length replacement characters', () => {
        expect(_replaceLeadingTrailingChars('##test##', '#', '**')).toBe('****test****')
    })

    it('preserves middle content while replacing edges', () => {
        expect(_replaceLeadingTrailingChars('__hello world__', '_', '*')).toBe('**hello world**')
    })

    it('handles single character string', () => {
        expect(_replaceLeadingTrailingChars(' ', ' ', '*')).toBe('*')
    })

    it('preserves spaces in middle while replacing edges', () => {
        expect(_replaceLeadingTrailingChars('  hello  world  ', ' ', '*')).toBe('**hello  world**')
    })
})
