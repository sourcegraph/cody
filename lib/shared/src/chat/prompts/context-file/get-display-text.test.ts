import { describe, expect, it } from 'vitest'

import { getDisplayTextForFileUri } from './get-display-text'

describe('getDisplayTextForFileUri', () => {
    it('replaces file name with markdown link', () => {
        const text = 'Hello @test.js'
        const expected = 'Hello [_@test.js_](vscode://file/path/to/test.js)'

        const result = getDisplayTextForFileUri(text, '@test.js', '/path/to/test.js')

        expect(result).toEqual(expected)
    })

    it('respects spaces in file name', () => {
        const text = 'Loaded @my file.js'
        const expected = 'Loaded [_@my file.js_](vscode://file/path/to/my file.js)'

        const result = getDisplayTextForFileUri(text, '@my file.js', '/path/to/my file.js')

        expect(result).toEqual(expected)
    })

    it('returns original text if no match', () => {
        const text = 'No file name'

        const result = getDisplayTextForFileUri(text, '@test.js', '/path/to/test.js')

        expect(result).toEqual(text)
    })

    it('handles special characters in path', () => {
        const text = 'Loaded @test.js'
        const expected = 'Loaded [_@test.js_](vscode://file/path/with/@#special$chars.js)'

        const result = getDisplayTextForFileUri(text, '@test.js', '/path/with/@#special$chars.js')

        expect(result).toEqual(expected)
    })

    it('handles line numbers', () => {
        const text = 'Error in @test.js'
        const expected = 'Error in [_@test.js_](vscode://file/path/test.js:10)'

        const result = getDisplayTextForFileUri(text, '@test.js', '/path/test.js', 10)

        expect(result).toEqual(expected)
    })

    it('handles line numbers', () => {
        const text = 'Compare and explain @foo.js and @bar.js. What does @foo.js do?'
        const expected =
            'Compare and explain [_@foo.js_](vscode://file/path/foo.js:10) and @bar.js. What does [_@foo.js_](vscode://file/path/foo.js:10) do?'

        const result = getDisplayTextForFileUri(text, '@foo.js', '/path/foo.js', 10)

        expect(result).toEqual(expected)
    })
})
