import { describe, expect, it } from 'vitest'

import { getDisplayTextForFileUri } from './context-file-prompt'

describe('getDisplayTextForFileUri', () => {
    it('replaces file name with markdown link', () => {
        const text = 'Hello world file.ts'
        const fileName = 'file.ts'
        const fsPath = '/path/to/file.ts'
        const expected = 'Hello world [_file.ts_](vscode://file/path/to/file.ts)'

        const result = getDisplayTextForFileUri(text, fileName, fsPath)

        expect(result).toEqual(expected)
    })

    it('adds start line to link', () => {
        const text = 'Hello world file.ts'
        const fileName = 'file.ts'
        const fsPath = '/path/to/file.ts'
        const startLine = 10
        const expected = 'Hello world [_file.ts_](vscode://file/path/to/file.ts:10)'

        const result = getDisplayTextForFileUri(text, fileName, fsPath, startLine)

        expect(result).toEqual(expected)
    })

    it('trims file name', () => {
        const text = 'Hello world file.ts'
        const fileName = ' file.ts '
        const fsPath = '/path/to/file.ts'
        const expected = 'Hello world [_file.ts_](vscode://file/path/to/file.ts)'

        const result = getDisplayTextForFileUri(text, fileName, fsPath)

        expect(result).toEqual(expected)
    })

    it('returns original text if no file name match', () => {
        const text = 'Hello world'
        const fileName = 'no-match'
        const fsPath = '/path'

        const result = getDisplayTextForFileUri(text, fileName, fsPath)

        expect(result).toEqual(text)
    })

    it('handles special characters in file name', () => {
        const text = 'Hello world'
        const fileName = 'file-#.ts'
        const fsPath = '/path'
        const expected = 'Hello world [_file-#.ts_](vscode://file/path)'

        const result = getDisplayTextForFileUri(text, fileName, fsPath)

        expect(result).toEqual(expected)
    })

    it('handles Windows file paths', () => {
        const text = 'Hello world'
        const fileName = 'file.ts'
        const fsPath = 'C:\\path\\to\\file.ts'
        const expected = 'Hello world [_file.ts_](vscode://file/C:\\path\\to\\file.ts)'

        const result = getDisplayTextForFileUri(text, fileName, fsPath)

        expect(result).toEqual(expected)
    })

    it('handles spaces in file path', () => {
        const text = 'Hello world'
        const fileName = 'file.ts'
        const fsPath = '/path with spaces/file.ts'
        const expected = 'Hello world [_file.ts_](vscode://file/path%20with%20spaces/file.ts)'

        const result = getDisplayTextForFileUri(text, fileName, fsPath)

        expect(result).toEqual(expected)
    })

    it('handles special regex characters in file name', () => {
        const text = 'Hello world'
        const fileName = 'file+.ts'
        const fsPath = '/path'
        const expected = 'Hello world [_file+.ts_](vscode://file/path)'

        const result = getDisplayTextForFileUri(text, fileName, fsPath)

        expect(result).toEqual(expected)
    })

    it('handles special regex characters in file path', () => {
        const text = 'Hello world'
        const fileName = 'file.ts'
        const fsPath = '/path/with/regex-chars?[a-z]'
        const expected = 'Hello world [_file.ts_](vscode://file/path/with/regex-chars%3F%5Ba-z%5D)'

        const result = getDisplayTextForFileUri(text, fileName, fsPath)

        expect(result).toEqual(expected)
    })

    it('handles non-ASCII characters', () => {
        const text = 'Hello world'
        const fileName = 'fïle.ts'
        const fsPath = '/påth/to/fïle.ts'
        const expected = 'Hello world [_fïle.ts_](vscode://file/p%C3%A5th/to/f%C3%AFle.ts)'

        const result = getDisplayTextForFileUri(text, fileName, fsPath)

        expect(result).toEqual(expected)
    })

    it('handles very long file paths', () => {
        const text = 'Hello world'
        const fileName = 'file.ts'
        const veryLongFsPath = '/a/very/long/path/with/many/segments/over/100/chars/file.ts'
        const expected = 'Hello world [_file.ts_](vscode://file' + veryLongFsPath + ')'

        const result = getDisplayTextForFileUri(text, fileName, veryLongFsPath)

        expect(result).toEqual(expected)
    })

    it('handles file paths with query parameters', () => {
        const text = 'Hello world'
        const fileName = 'file.ts'
        const fsPath = '/path/file.ts?query=test'
        const expected = 'Hello world [_file.ts_](vscode://file/path/file.ts%3Fquery%3Dtest)'

        const result = getDisplayTextForFileUri(text, fileName, fsPath)

        expect(result).toEqual(expected)
    })
})
