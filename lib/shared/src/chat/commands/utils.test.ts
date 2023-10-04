import { describe, expect, it } from 'vitest'

import { extractTestType, isValidTestFileName } from './utils'

describe('extractTestType', () => {
    it('extracts "unit" from test type', () => {
        const text = 'add unit tests here'
        const expected = 'unit'

        const result = extractTestType(text)

        expect(result).toEqual(expected)
    })

    it('extracts "e2e" from test type', () => {
        const text = 'missing e2e test coverage'
        const expected = 'e2e'

        const result = extractTestType(text)

        expect(result).toEqual(expected)
    })

    it('extracts "integration" from test type', () => {
        const text = 'needs more integration testing'
        const expected = 'integration'

        const result = extractTestType(text)

        expect(result).toEqual(expected)
    })

    it('returns empty string if no match', () => {
        const text = 'test this function'
        const expected = ''

        const result = extractTestType(text)

        expect(result).toEqual(expected)
    })
})

describe('isValidTestFileName', () => {
    it('returns true for file starting with "test"', () => {
        const filePath = '/path/to/testFile.java'
        expect(isValidTestFileName(filePath)).toBe(true)
    })

    it('returns true for file ending with "test"', () => {
        const filePath = '/path/to/fileTest.js'
        expect(isValidTestFileName(filePath)).toBe(true)
    })

    it('returns true for file starting with "test_"', () => {
        const filePath = '/path/to/test_file.py'
        expect(isValidTestFileName(filePath)).toBe(true)
    })

    it('returns false for file starting with "test-" prefix', () => {
        const filePath = '/path/to/test-file.js'
        expect(isValidTestFileName(filePath)).toBe(false)
    })

    it('returns false for file in node_modules directory', () => {
        const filePath = '/path/to/node_modules/file.js'
        expect(isValidTestFileName(filePath)).toBe(false)
    })

    it('returns false for non-test file name', () => {
        const filePath = '/path/to/file.js'
        expect(isValidTestFileName(filePath)).toBe(false)
    })
})
