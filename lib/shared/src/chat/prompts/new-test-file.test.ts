import { describe, expect, it } from 'vitest'

import { convertFsPathToTestFile, createDefaultTestFileNameByLanguageExt, isValidTestFileName } from './new-test-file'

describe('isValidTestFileName', () => {
    it('should return false for undefined file path', () => {
        expect(isValidTestFileName(undefined)).toBe(false)
    })

    it('should return true for valid test file names', () => {
        expect(isValidTestFileName('test_file.ts')).toBe(true)
        expect(isValidTestFileName('file.test.js')).toBe(true)
    })

    it('should return false for invalid test file names', () => {
        expect(isValidTestFileName('file.ts')).toBe(false)
        expect(isValidTestFileName('test-file.js')).toBe(false)
    })
})

describe('createDefaultTestFileNameByLanguageExt', () => {
    // All test should work with ext including . or not
    it('should create a test file name with .test suffix for js and ts files', () => {
        expect(createDefaultTestFileNameByLanguageExt('file', 'ts')).toBe('file.test.ts')
        expect(createDefaultTestFileNameByLanguageExt('file', '.js')).toBe('file.test.js')
    })

    it('should create a test file name with _test suffix for py and rb files', () => {
        expect(createDefaultTestFileNameByLanguageExt('file', '.py')).toBe('file_test.py')
        expect(createDefaultTestFileNameByLanguageExt('file', 'rb')).toBe('file_test.rb')
    })

    it('should create a test file name with Test suffix for other files', () => {
        expect(createDefaultTestFileNameByLanguageExt('file', '.cpp')).toBe('fileTest.cpp')
        expect(createDefaultTestFileNameByLanguageExt('file', 'java')).toBe('fileTest.java')
    })
})

describe('convertFsPathToTestFile', () => {
    it('should return the current file path if it is already a test file', () => {
        const testFilePath = '/path/to/testFile.test.ts'
        expect(convertFsPathToTestFile(testFilePath)).toBe(testFilePath)
    })

    it('should generate a test file path from a non-test file path', () => {
        const filePath = '/path/to/file.ts'
        const existingTestFilePath = '/path/to/testFile.ts'
        expect(convertFsPathToTestFile(filePath, existingTestFilePath)).toBe('/path/to/file.test.ts')
    })

    it('should follow an existing test file path', () => {
        const filePath = '/path/to/file.ts'
        const existingTestFilePath = '/path/to/existingTestFile.test.ts'
        expect(convertFsPathToTestFile(filePath, existingTestFilePath)).toBe('/path/to/file.test.ts')
    })

    it('should respect different naming conventions', () => {
        const filePath = '/path/to/file.ts'
        const existingTestFilePath = '/path/to/testExistingFile.test.ts'
        expect(convertFsPathToTestFile(filePath, existingTestFilePath)).toBe('/path/to/file.test.ts')
    })

    it('should handle a non-alphanumeric character at the test character index', () => {
        const filePath = '/path/to/file.ts'
        const existingTestFilePath = '/path/to/test-ExistingFile.test.ts'
        expect(convertFsPathToTestFile(filePath, existingTestFilePath)).toBe('/path/to/file.test.ts')
    })

    it('should generate a test file path for a non-test file path in python', () => {
        const filePath = '/path/to/file.py'
        const existingTestFilePath = '/path/to/testFile_test.py'
        expect(convertFsPathToTestFile(filePath, existingTestFilePath)).toBe('/path/to/file_test.py')
    })

    it('should generate a test file path for a non-test file path in python when no exisiting test path provided', () => {
        const filePath = '/path/to/test-file.py'
        expect(convertFsPathToTestFile(filePath)).toBe('/path/to/test-file_test.py')
    })
})
