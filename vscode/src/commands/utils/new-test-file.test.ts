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
        expect(convertFileUriToTestFileUri(URI.file('/path/to/testFile.test.ts')).toString()).toBe(
            URI.file('/path/to/testFile.test.ts').toString()
        )
    })

    it('should return the current file uri if it is already a spec file', () => {
        expect(convertFileUriToTestFileUri(URI.file('/path/to/testFile.spec.rb')).toString()).toBe(
            URI.file('/path/to/testFile.spec.rb').toString()
        )
    })

    it('should generate a test file uri from a non-test file uri', () => {
        expect(
            convertFileUriToTestFileUri(URI.file('/path/to/file.ts'), URI.file('/path/to/testFile.ts')).toString()
        ).toBe(URI.file('/path/to/file.test.ts').toString())
    })

    it('should generate the default spec file uri from a non-test file uri for ruby', () => {
        expect(
            convertFileUriToTestFileUri(URI.file('/path/to/file.rb'), URI.file('/path/to/testFile.ts')).toString()
        ).toBe(URI.file('/path/to/file_spec.rb').toString())
    })

    it('should follow an existing test file uri', () => {
        expect(
            convertFileUriToTestFileUri(
                URI.file('/path/to/file.ts'),
                URI.file('/path/to/existingTestFile.test.ts')
            ).toString()
        ).toBe(URI.file('/path/to/file.test.ts').toString())
    })

    it('should respect test file with different naming conventions', () => {
        expect(
            convertFileUriToTestFileUri(
                URI.file('/path/to/file.ts'),
                URI.file('/path/to/testExistingFile.test.ts')
            ).toString()
        ).toBe(URI.file('/path/to/file.test.ts').toString())
    })

    it('should handle a non-alphanumeric character at the test character index', () => {
        expect(
            convertFileUriToTestFileUri(
                URI.file('/path/to/file.ts'),
                URI.file('/path/to/test-ExistingFile.test.ts')
            ).toString()
        ).toBe(URI.file('/path/to/file.test.ts').toString())
    })

    it('should generate a test file uri for a non-test file uri in python', () => {
        expect(
            convertFileUriToTestFileUri(URI.file('/path/to/file.py'), URI.file('/path/to/testFile_test.py')).toString()
        ).toBe(URI.file('/path/to/file_test.py').toString())
    })

    it('should generate a test file uri for a non-test file uri in python when no exisiting test path provided', () => {
        expect(convertFileUriToTestFileUri(URI.file('/path/to/test-file.py')).toString()).toBe(
            URI.file('/path/to/test-file_test.py').toString()
        )
    })

    it('should generate the default spec file uri for ruby when no exisiting test files is found', () => {
        expect(convertFileUriToTestFileUri(URI.file('/path/to/file.rb'), undefined).toString()).toBe(
            URI.file('/path/to/file_spec.rb').toString()
        )
    })

    it('should generate the corrent test file uri for window files', () => {
        expect(
            convertFileUriToTestFileUri(
                URI.file('\\path\\to\\file.ts'),
                URI.file('\\path\\to\\testFile.test.ts')
            ).toString()
        ).toBe(URI.file('\\path\\to\\file.test.ts').toString())
    })

    it('should follow an existing test file uri format to generate new test file uri on windows', () => {
        expect(
            convertFileUriToTestFileUri(
                URI.file('\\server\\c$\\folder\\current-file.go'),
                URI.file('\\path\\to\\file_test.go')
            ).toString()
        ).toBe(URI.file('\\server\\c$\\folder\\current-file_test.go').toString())
    })
})
