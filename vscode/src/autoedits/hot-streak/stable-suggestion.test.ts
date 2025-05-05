import { describe, expect, it } from 'vitest'
import { isStableUnchangedHunk } from './stable-suggestion'

describe('isStableUnchangedHunk', () => {
    it('should identify stable hunks with meaningful content', () => {
        expect(isStableUnchangedHunk(['const a = 5;'])).toBe(true)
        expect(isStableUnchangedHunk(['function test() {', '  return true;', '}'])).toBe(true)
        expect(isStableUnchangedHunk(['// A meaningful comment'])).toBe(true)
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
        expect(isStableUnchangedHunk(['', 'const a = 5;'])).toBe(true)
    })

    it('should handle mixed content correctly', () => {
        expect(isStableUnchangedHunk(['{', 'const a = 5;'])).toBe(true)
        expect(isStableUnchangedHunk(['{}', '[]', 'const a = 5;'])).toBe(true)
        expect(isStableUnchangedHunk(['{', '}', '[]'])).toBe(false)
    })
})
