import { describe, expect, it } from 'vitest'
import { isStableUnchangedHunk } from './stable-suggestion'

const STABLE_CHUNK = ['const a = 5;', 'const b = 6;', 'const c = 7;']

describe('isStableUnchangedHunk', () => {
    it('should identify stable hunks with meaningful content', () => {
        expect(isStableUnchangedHunk(STABLE_CHUNK)).toBe(true)
        expect(isStableUnchangedHunk(['function test() {', '  return true;', '}'])).toBe(true)
        expect(
            isStableUnchangedHunk([
                '// A meaningful comment',
                '// Another comment',
                '// A final comment',
            ])
        ).toBe(true)
    })

    it('should reject hunks with meaningful content but not enough lines', () => {
        expect(isStableUnchangedHunk(STABLE_CHUNK.slice(0, 2))).toBe(false)
    })

    it('should reject hunks with only brackets or delimiters', () => {
        expect(isStableUnchangedHunk(['{'])).toBe(false)
        expect(isStableUnchangedHunk(['}'])).toBe(false)
        expect(isStableUnchangedHunk(['[]'])).toBe(false)
        expect(isStableUnchangedHunk(['()'])).toBe(false)
        expect(isStableUnchangedHunk(['{('])).toBe(false)
        expect(isStableUnchangedHunk(['{};,.'])).toBe(false)
    })

    it('should handle empty lines correctly', () => {
        expect(isStableUnchangedHunk([''])).toBe(false)
        expect(isStableUnchangedHunk(['  '])).toBe(false)
        expect(isStableUnchangedHunk(['\n'])).toBe(false)
        expect(isStableUnchangedHunk(['  \n'])).toBe(false)
        expect(isStableUnchangedHunk(['', ...STABLE_CHUNK])).toBe(true)
    })

    it('should handle mixed content correctly', () => {
        expect(isStableUnchangedHunk(['{', ...STABLE_CHUNK])).toBe(true)
        expect(isStableUnchangedHunk(['{}', '[]', 'const a = 5;'])).toBe(true)
        expect(isStableUnchangedHunk(['{', '}', '[]'])).toBe(false)
    })
})
