import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { setDisplayPathEnvInfo, type DisplayPathEnvInfo } from '@sourcegraph/cody-shared/src/editor/displayPath'

import { replaceFileNameWithMarkdownLink } from './display-text'

describe('replaceFileNameWithMarkdownLink', () => {
    // Mock a `displayPath` function that always uses forward slashes (even on Windows).
    let orig: DisplayPathEnvInfo | null
    beforeEach(() => {
        orig = setDisplayPathEnvInfo({ isWindows: false, workspaceFolders: [URI.file('/')] })
    })
    afterEach(() => {
        setDisplayPathEnvInfo(orig)
    })

    it('replaces file name with markdown link', () => {
        expect(replaceFileNameWithMarkdownLink('Hello @path/to/test.js', URI.file('/path/to/test.js'))).toEqual(
            'Hello [_@path/to/test.js_](command:cody.chat.open.file?%22file%3A%2F%2F%2Fpath%2Fto%2Ftest.js%3Arange%3A0%22)'
        )
    })

    it('replaces file name with range with markdown link', () => {
        expect(
            replaceFileNameWithMarkdownLink('What is @foo.ts:2-2?', URI.file('/foo.ts'), new vscode.Range(2, 0, 2, 0))
        ).toEqual('What is [_@foo.ts:2-2_](command:cody.chat.open.file?%22file%3A%2F%2F%2Ffoo.ts%3Arange%3A2%22)?')
    })

    it('replaces file name with symbol with markdown link', () => {
        expect(
            replaceFileNameWithMarkdownLink(
                'What is @e2e/cody.ts:2-2#codySymbol?',
                URI.file('/e2e/cody.ts'),
                new vscode.Range(2, 0, 2, 0),
                'codySymbol'
            )
        ).toEqual(
            'What is [_@e2e/cody.ts:2-2#codySymbol_](command:cody.chat.open.file?%22file%3A%2F%2F%2Fe2e%2Fcody.ts%3Arange%3A2%22)?'
        )
    })

    it('respects spaces in file name', () => {
        expect(replaceFileNameWithMarkdownLink('Loaded @my file.js', URI.file('/my file.js'))).toEqual(
            'Loaded [_@my file.js_](command:cody.chat.open.file?%22file%3A%2F%2F%2Fmy%2520file.js%3Arange%3A0%22)'
        )
    })

    describe('OS-native path separators', () => {
        /** Mimics the behavior of {@link URI.file} on Windows, regardless of the current platform. */
        function windowsFileURI(fsPath: string): URI {
            return URI.file(fsPath.replaceAll('\\', '/'))
        }

        // Mock a `displayPath` function that uses backslashes and make sure it's used everywhere.
        let orig: any
        beforeEach(() => {
            orig = setDisplayPathEnvInfo({ isWindows: true, workspaceFolders: [windowsFileURI('C:\\')] })
        })
        afterEach(() => {
            setDisplayPathEnvInfo(orig)
        })

        it('uses OS-native path separator', () => {
            expect(replaceFileNameWithMarkdownLink('Loaded @a\\b.js', windowsFileURI('C:\\a\\b.js'))).toEqual(
                'Loaded [_@a\\b.js_](command:cody.chat.open.file?%22file%3A%2F%2F%2Fc%253A%2Fa%2Fb.js%3Arange%3A0%22)'
            )
        })
    })

    it('returns original text if no match', () => {
        expect(replaceFileNameWithMarkdownLink('No file name', URI.file('/test.js'))).toEqual('No file name')
    })

    it('handles special characters in path', () => {
        expect(
            replaceFileNameWithMarkdownLink(
                'Loaded @path/with/@#special$chars.js',
                URI.file('/path/with/@#special$chars.js')
            )
        ).toEqual(
            'Loaded [_@path/with/@#special$chars.js_](command:cody.chat.open.file?%22file%3A%2F%2F%2Fpath%2Fwith%2F%2540%2523special%2524chars.js%3Arange%3A0%22)'
        )
    })

    it('handles line numbers', () => {
        expect(
            replaceFileNameWithMarkdownLink('Error in @test.js:2-2', URI.file('/test.js'), new vscode.Range(2, 0, 2, 0))
        ).toEqual('Error in [_@test.js:2-2_](command:cody.chat.open.file?%22file%3A%2F%2F%2Ftest.js%3Arange%3A2%22)')
    })

    it('handles non alphanumeric characters follows the file name in input', () => {
        expect(
            replaceFileNameWithMarkdownLink('What is @test.js:2-2?', URI.file('/test.js'), new vscode.Range(2, 0, 2, 0))
        ).toEqual('What is [_@test.js:2-2_](command:cody.chat.open.file?%22file%3A%2F%2F%2Ftest.js%3Arange%3A2%22)?')
    })

    it('handles edge case where start line at 0 - exclude start line in markdown link', () => {
        expect(
            replaceFileNameWithMarkdownLink('Error in @test.js', URI.file('/test.js'), new vscode.Range(0, 0, 0, 0))
        ).toEqual('Error in [_@test.js_](command:cody.chat.open.file?%22file%3A%2F%2F%2Ftest.js%3Arange%3A0%22)')
    })

    it('handles names that showed up more than once', () => {
        expect(
            replaceFileNameWithMarkdownLink(
                'Compare and explain @foo.js:2-2 and @bar.js. What does @foo.js:2-2 do?',
                URI.file('/foo.js'),
                new vscode.Range(2, 0, 2, 0)
            )
        ).toEqual(
            'Compare and explain [_@foo.js:2-2_](command:cody.chat.open.file?%22file%3A%2F%2F%2Ffoo.js%3Arange%3A2%22) and @bar.js. What does [_@foo.js:2-2_](command:cody.chat.open.file?%22file%3A%2F%2F%2Ffoo.js%3Arange%3A2%22) do?'
        )
    })

    it('ignores repeated file names that are followed by another character', () => {
        expect(
            replaceFileNameWithMarkdownLink(
                'Compare and explain @foo.js:2-2 and @bar.js. What does @foo.js:2-2#FooBar() do?',
                URI.file('/foo.js'),
                new vscode.Range(2, 0, 2, 0)
            )
        ).toEqual(
            'Compare and explain [_@foo.js:2-2_](command:cody.chat.open.file?%22file%3A%2F%2F%2Ffoo.js%3Arange%3A2%22) and @bar.js. What does @foo.js:2-2#FooBar() do?'
        )
    })

    it('handles file names with line number and symbol name', () => {
        const text = '@vscode/src/logged-rerank.ts:7-23#getRerankWithLog() what does this do'

        const result = replaceFileNameWithMarkdownLink(
            text,
            URI.file('/vscode/src/logged-rerank.ts'),
            new vscode.Range(7, 0, 23, 0),
            'getRerankWithLog()'
        )

        expect(result).toEqual(
            '[_@vscode/src/logged-rerank.ts:7-23#getRerankWithLog()_](command:cody.chat.open.file?%22file%3A%2F%2F%2Fvscode%2Fsrc%2Flogged-rerank.ts%3Arange%3A7%22) what does this do'
        )
    })
})
