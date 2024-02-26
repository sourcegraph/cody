import path from 'path/posix'
import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { getSearchPatternForTestFiles } from './search-pattern'

describe('getSearchPatternForTestFiles', () => {
    it('returns pattern searching current directory for test files with same extension', () => {
        const file = URI.file('/path/to/file.js')
        const pattern = getSearchPatternForTestFiles(file, true)
        expect(pattern).toEqual(osPath('/path/to/*{test,spec}*.js'))
    })

    it('returns pattern searching workspace for test files matching file name', () => {
        const file = URI.file('/path/to/file.ts')
        const pattern = getSearchPatternForTestFiles(file, false, true)
        expect(pattern).toEqual(
            osPath(
                '**/*{test_file,file_test,test.file,file.test,fileTest,spec_file,file_spec,spec.file,file.spec,fileSpec}.ts'
            )
        )
    })

    it('returns pattern searching workspace for test files with same extension', () => {
        const file = URI.file('/path/to/file.py')
        const pattern = getSearchPatternForTestFiles(file)
        expect(pattern).toEqual(osPath('**/*{test,spec}*.py'))
    })

    it('handles files with no extension', () => {
        const file = URI.file('/path/to/file')
        const pattern = getSearchPatternForTestFiles(file)
        expect(pattern).toEqual(osPath('**/*{test,spec}*'))
    })
})

// Hack: update pattern to use OS path separator
const osPath = (pattern: string): string => pattern.replace('/', path.sep)
