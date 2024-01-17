import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'

import { convertFileUriToTestFileUri, createDefaultTestFileNameByLanguageExt } from './new-test-file'

describe('createDefaultTestFileNameByLanguageExt', () => {
    // All test should work with ext including . or not
    it('should create a test file name with .test suffix for js and ts files', () => {
        expect(createDefaultTestFileNameByLanguageExt('file', 'ts')).toBe('file.test.ts')
        expect(createDefaultTestFileNameByLanguageExt('file', '.js')).toBe('file.test.js')
    })

    it('should create a test file name with _test suffix for py and go files', () => {
        expect(createDefaultTestFileNameByLanguageExt('file', '.py')).toBe('file_test.py')
        expect(createDefaultTestFileNameByLanguageExt('file', 'go')).toBe('file_test.go')
    })

    it('should create a test file name with _spec suffix for rb files', () => {
        expect(createDefaultTestFileNameByLanguageExt('file', '.rb')).toBe('file_spec.rb')
    })

    it('should create a test file name with Test suffix for other files', () => {
        expect(createDefaultTestFileNameByLanguageExt('file', '.cpp')).toBe('fileTest.cpp')
        expect(createDefaultTestFileNameByLanguageExt('file', 'java')).toBe('fileTest.java')
    })
})

describe('convertFileUriToTestFileUri', () => {
    it('should return the current file uri if it is already a test file', () => {
        const testFile = URI.file('/path/to/testFile.test.ts')
        expect(convertFileUriToTestFileUri(testFile)).toStrictEqual(testFile)
    })

    it('should return the current file uri if it is already a spec file', () => {
        const testFile = URI.file('/path/to/testFile.spec.rb')
        expect(convertFileUriToTestFileUri(testFile)).toStrictEqual(testFile)
    })

    it('should generate a test file uri from a non-test file uri', () => {
        const currentFile = URI.file('/path/to/file.ts')
        const existingTestFile = URI.file('/path/to/testFile.ts')
        const expected = URI.file('/path/to/file.test.ts')
        expect(convertFileUriToTestFileUri(currentFile, existingTestFile)).toStrictEqual(expected)
    })

    it('should generate the default spec file uri from a non-test file uri for ruby', () => {
        const currentFile = URI.file('/path/to/file.rb')
        const existingTestFile = URI.file('/path/to/testFile.ts')
        const expected = URI.file('/path/to/file_spec.rb')
        expect(convertFileUriToTestFileUri(currentFile, existingTestFile)).toStrictEqual(expected)
    })

    it('should follow an existing test file uri', () => {
        const currentFile = URI.file('/path/to/file.ts')
        const existingTestFile = URI.file('/path/to/existingTestFile.test.ts')
        const expected = URI.file('/path/to/file.test.ts')
        expect(convertFileUriToTestFileUri(currentFile, existingTestFile)).toStrictEqual(expected)
    })

    it('should respect test file with different naming conventions', () => {
        const currentFile = URI.file('/path/to/file.ts')
        const existingTestFile = URI.file('/path/to/testExistingFile.test.ts')
        const expected = URI.file('/path/to/file.test.ts')
        expect(convertFileUriToTestFileUri(currentFile, existingTestFile)).toStrictEqual(expected)
    })

    it('should handle a non-alphanumeric character at the test character index', () => {
        const currentFile = URI.file('/path/to/file.ts')
        const existingTestFile = URI.file('/path/to/test-ExistingFile.test.ts')
        const expected = URI.file('/path/to/file.test.ts')
        expect(convertFileUriToTestFileUri(currentFile, existingTestFile)).toStrictEqual(expected)
    })

    it('should generate a test file uri for a non-test file uri in python', () => {
        const currentFile = URI.file('/path/to/file.py')
        const existingTestFile = URI.file('/path/to/testFile_test.py')
        const expected = URI.file('/path/to/file_test.py')
        expect(convertFileUriToTestFileUri(currentFile, existingTestFile)).toStrictEqual(expected)
    })

    it('should generate a test file uri for a non-test file uri in python when no exisiting test path provided', () => {
        const currentFile = URI.file('/path/to/test-file.py')
        const expected = URI.file('/path/to/test-file_test.py')
        expect(convertFileUriToTestFileUri(currentFile)).toStrictEqual(expected)
    })

    it('should generate the default spec file uri for ruby when no exisiting test files is found', () => {
        const currentFile = URI.file('/path/to/file.rb')
        const existingTestFile = undefined
        const expected = URI.file('/path/to/file_spec.rb')
        expect(convertFileUriToTestFileUri(currentFile, existingTestFile)).toStrictEqual(expected)
    })

    it('should generate the corrent test file uri for window files', () => {
        const currentFile = URI.file('\\path\\to\\file.ts')
        const existingTestFile = URI.file('\\path\\to\\testFile.test.ts')
        const expected = URI.file('\\path\\to\\file.test.ts')
        expect(convertFileUriToTestFileUri(currentFile, existingTestFile)).toStrictEqual(expected)
    })

    it('should follow an existing test file uri format to generate new test file uri on windows', () => {
        const currentFile = URI.file('\\server\\c$\\folder\\current-file.go')
        const existingTestFile = URI.file('\\path\\to\\file_test.go')
        const expected = URI.file('\\server\\c$\\folder\\current-file_test.go')
        expect(convertFileUriToTestFileUri(currentFile, existingTestFile)).toStrictEqual(expected)
    })
})
