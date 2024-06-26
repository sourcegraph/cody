import { describe, expect, it } from 'vitest'
import { getLastFullLine } from './utils'

describe('getLastFullLine', () => {
    it('works as expected', () => {
        const str0 = 'Hello'
        expect(getLastFullLine(str0)).toBe('') // No full line, so empty string

        const str1 = 'Hello\nWorld\n'
        expect(getLastFullLine(str1)).toBe('World')

        const str2 = 'Hello\nWorld'
        expect(getLastFullLine(str2)).toBe('Hello')

        const str3 = 'Hello\nWorld\nmy name is'
        expect(getLastFullLine(str3)).toBe('World')
    })
})
