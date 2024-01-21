import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'

import { convertFileUriToTestFileUri, createDefaultTestFile } from './new-test-file'

describe('createDefaultTestFile', () => {
    it.each([
        ['/path/to/file.java', '/path/to/fileTest.java'],
        ['/path/to/file.js', '/path/to/file.test.js'],
        ['/path/to/file.go', '/path/to/file_test.go'],
        ['/path/to/test_file.py', '/path/to/test_file.py'],
        ['/path/to/test-file.js', '/path/to/test-file.test.js'],
        ['/path/to/node_modules/file.js', '/path/to/node_modules/file.test.js'],
        ['/path/to/node_modules/file_test.ts', '/path/to/node_modules/file_test.ts'],
        ['/path/to/fileTest.js', '/path/to/fileTest.js'],
        ['test_example.py', 'test_example.py'],
        ['example.cpp', 'exampleTest.cpp'],
        ['example.test.js', 'example.test.js'],
        ['Example.java', 'ExampleTest.java'],
        ['ExampleTest.java', 'ExampleTest.java'],
        ['example.rb', 'example_spec.rb'],
        ['Example.cs', 'ExampleTest.cs'],
        ['ExampleTest.php', 'ExampleTest.php'],
        ['ExampleSpec.scala', 'ExampleSpec.scala'],
        ['file.rb', 'file_spec.rb'],
        ['contest.ts', 'contest.test.ts'],
    ])('for file %j it returns %j', (file, test) => {
        expect(createDefaultTestFile(URI.file(file)).toString()).toBe(URI.file(test).toString())
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
            convertFileUriToTestFileUri(
                URI.file('/path/to/file.ts'),
                URI.file('/path/to/testFile.ts')
            ).toString()
        ).toBe(URI.file('/path/to/file.test.ts').toString())
    })

    it('should generate the default spec file uri from a non-test file uri for ruby', () => {
        expect(
            convertFileUriToTestFileUri(
                URI.file('/path/to/file.rb'),
                URI.file('/path/to/testFile.ts')
            ).toString()
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
            convertFileUriToTestFileUri(
                URI.file('/path/to/file.py'),
                URI.file('/path/to/testFile_test.py')
            ).toString()
        ).toBe(URI.file('/path/to/file_test.py').toString())
    })

    it('should generate a test file uri for a non-test file uri in python when no existing test path provided', () => {
        expect(convertFileUriToTestFileUri(URI.file('/path/to/test-file.py')).toString()).toBe(
            URI.file('/path/to/test-file_test.py').toString()
        )
    })

    it('should generate the default spec file uri for ruby when no existing test files is found', () => {
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
