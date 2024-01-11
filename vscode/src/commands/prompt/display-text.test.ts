import { describe, expect, it } from 'vitest'

import { replaceFileNameWithMarkdownLink } from './display-text'

describe('replaceFileNameWithMarkdownLink', () => {
    it('replaces file name with markdown link', () => {
        const text = 'Hello @test.js'

        const result = replaceFileNameWithMarkdownLink(text, '@test.js', '/path/to/test.js')

        expect(result).toEqual(
            'Hello [_@test.js_](command:cody.chat.open.file?%22%2Fpath%2Fto%2Ftest.js%3Arange%3A0%22)'
        )
    })

    it('replaces file name with symbol with markdown link', () => {
        const text = 'What is @e2e/cody.ts:2-2#codySymbol?'

        const result = replaceFileNameWithMarkdownLink(text, '@e2e/cody.ts:2-2#codySymbol', '/foo/test/e2e/cody.ts', 2)

        expect(result).toEqual(
            'What is [_@e2e/cody.ts:2-2#codySymbol_](command:cody.chat.open.file?%22%2Ffoo%2Ftest%2Fe2e%2Fcody.ts%3Arange%3A2%22)?'
        )
    })

    it('respects spaces in file name', () => {
        const text = 'Loaded @my file.js'

        const result = replaceFileNameWithMarkdownLink(text, '@my file.js', '/path/to/my file.js')

        expect(result).toEqual(
            'Loaded [_@my file.js_](command:cody.chat.open.file?%22%2Fpath%2Fto%2Fmy%20file.js%3Arange%3A0%22)'
        )
    })

    it('returns original text if no match', () => {
        const text = 'No file name'

        const result = replaceFileNameWithMarkdownLink(text, '@test.js', '/path/to/test.js')

        expect(result).toEqual(text)
    })

    it('handles special characters in path', () => {
        const text = 'Loaded @test.js'

        const result = replaceFileNameWithMarkdownLink(text, '@test.js', '/path/with/@#special$chars.js')

        expect(result).toEqual(
            'Loaded [_@test.js_](command:cody.chat.open.file?%22%2Fpath%2Fwith%2F%40%23special%24chars.js%3Arange%3A0%22)'
        )
    })

    it('handles line numbers', () => {
        const text = 'Error in @test.js'

        const result = replaceFileNameWithMarkdownLink(text, '@test.js', '/path/test.js', 10)

        expect(result).toEqual(
            'Error in [_@test.js_](command:cody.chat.open.file?%22%2Fpath%2Ftest.js%3Arange%3A10%22)'
        )
    })

    it('handles non alphanumeric characters follows the file name in input', () => {
        const text = 'What is @test.js?'

        const result = replaceFileNameWithMarkdownLink(text, '@test.js', '/path/test.js', 10)

        expect(result).toEqual(
            'What is [_@test.js_](command:cody.chat.open.file?%22%2Fpath%2Ftest.js%3Arange%3A10%22)?'
        )
    })

    it('handles edge case where start line at 0 - exclude start line in markdown link', () => {
        const text = 'Error in @test.js'

        const result = replaceFileNameWithMarkdownLink(text, '@test.js', '/path/test.js', 0)

        expect(result).toEqual('Error in [_@test.js_](command:cody.chat.open.file?%22%2Fpath%2Ftest.js%3Arange%3A0%22)')
    })

    it('handles names that showed up more than once', () => {
        const text = 'Compare and explain @foo.js and @bar.js. What does @foo.js do?'

        const result = replaceFileNameWithMarkdownLink(text, '@foo.js', '/path/foo.js', 10)

        expect(result).toEqual(
            'Compare and explain [_@foo.js_](command:cody.chat.open.file?%22%2Fpath%2Ffoo.js%3Arange%3A10%22) and @bar.js. What does [_@foo.js_](command:cody.chat.open.file?%22%2Fpath%2Ffoo.js%3Arange%3A10%22) do?'
        )
    })

    it('ignore repeated file names that are followed by another character', () => {
        const text = 'Compare and explain @foo.js and @bar.js. What does @foo.js#FooBar() do?'

        const result = replaceFileNameWithMarkdownLink(text, '@foo.js', '/path/foo.js', 10)

        expect(result).toEqual(
            'Compare and explain [_@foo.js_](command:cody.chat.open.file?%22%2Fpath%2Ffoo.js%3Arange%3A10%22) and @bar.js. What does @foo.js#FooBar() do?'
        )
    })

    // FAILING - NEED TO BE FIXED
    it('handles file names with line number and symbol name', () => {
        const text = '@vscode/src/logged-rerank.ts:7-23#getRerankWithLog() what does this do'

        const result = replaceFileNameWithMarkdownLink(
            text,
            '@vscode/src/logged-rerank.ts:7-23#getRerankWithLog()',
            '/vscode/src/logged-rerank.ts',
            7
        )

        expect(result).toEqual(
            '[_@vscode/src/logged-rerank.ts:7-23#getRerankWithLog()_](command:cody.chat.open.file?%22%2Fvscode%2Fsrc%2Flogged-rerank.ts%3Arange%3A7%22) what does this do'
        )
    })
})
