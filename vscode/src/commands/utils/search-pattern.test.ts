import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { getSearchPatternForTestFiles } from './search-pattern'
import path from 'path/posix'

describe.only('getSearchPatternForTestFiles', () => {
    it('returns pattern searching current directory for test files with same extension', () => {
        const file = URI.file('/path/to/file.js')
        const pattern = getSearchPatternForTestFiles(file, true)
        expect(pattern).toEqual(osPath('path/to/*{test,spec}*.js'))
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

// regex used for removing the leading separator from the path
const systemSep = path.sep
const regex = new RegExp(`^${systemSep}`)
const osPath = (pattern: string): string => URI.file(pattern).path.replace(regex, '')
