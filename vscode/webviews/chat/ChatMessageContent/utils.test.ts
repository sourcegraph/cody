import { describe, expect, test } from 'vitest'
import { getCodeBlockId } from './utils'

describe('getCodeBlockId', () => {
    // Basic functionality tests
    test('handles basic ASCII content', () => {
        const result = getCodeBlockId('console.log("hello")')
        expect(result).toBeTruthy()
        expect(typeof result).toBe('string')
    })

    test('handles content with filename', () => {
        const result = getCodeBlockId('console.log("hello")', 'test.js')
        const resultWithoutFile = getCodeBlockId('console.log("hello")')
        expect(result).not.toBe(resultWithoutFile)
    })

    // Edge cases that previously caused errors
    test('handles non-UTF8 characters', () => {
        const result = getCodeBlockId('\uD800\uDFFF') // Surrogate pair
        expect(result).toBeTruthy()
    })

    test('handles null bytes', () => {
        const result = getCodeBlockId('hello\0world')
        expect(result).toBeTruthy()
    })

    test('handles emoji and special characters', () => {
        const result = getCodeBlockId('Hello 👋 World! ★')
        expect(result).toBeTruthy()
    })

    // Consistency tests
    test('produces consistent hashes for same input', () => {
        const input = 'test content'
        const hash1 = getCodeBlockId(input)
        const hash2 = getCodeBlockId(input)
        expect(hash1).toBe(hash2)
    })

    // Empty and whitespace tests
    test('handles empty strings', () => {
        const result = getCodeBlockId('')
        expect(result).toBeTruthy()
    })

    test('handles whitespace strings', () => {
        const result = getCodeBlockId('   \n\t   ')
        expect(result).toBeTruthy()
    })

    // Large input test
    test('handles large input strings', () => {
        const largeInput = 'x'.repeat(1000000)
        const result = getCodeBlockId(largeInput)
        expect(result).toBeTruthy()
    })

    // Invalid input handling
    test('handles undefined filename', () => {
        const result = getCodeBlockId('content', undefined)
        expect(result).toBeTruthy()
    })

    // Control characters test
    test('handles control characters', () => {
        const result = getCodeBlockId('\x00\x01\x02\x03\x04\x05')
        expect(result).toBeTruthy()
    })
})
