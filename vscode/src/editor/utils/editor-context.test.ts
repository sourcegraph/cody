import { basename } from 'path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { testFileUri } from '@sourcegraph/cody-shared'
import { ignores } from '@sourcegraph/cody-shared/src/chat/context-filter'

import { getFileContextFiles } from './editor-context'

vi.mock('lodash', () => ({
    throttle: vi.fn(fn => fn),
}))

afterEach(() => {
    vi.clearAllMocks()
})

describe('getFileContextFiles', () => {
    function setFiles(relativePaths: string[]) {
        vscode.workspace.findFiles = vi.fn().mockResolvedValueOnce(relativePaths.map(f => testFileUri(f)))
    }

    async function runSearch(query: string, maxResults: number): Promise<(string | undefined)[]> {
        const results = await getFileContextFiles(query, maxResults, new vscode.CancellationTokenSource().token)

        return results.map(f => basename(f.uri.fsPath))
    }

    it('fuzzy filters results', async () => {
        setFiles(['foo/bar/baz/file.go', 'foo/bar/File/go-has-parts', 'foo/bar/baz/FileWontMatch.ts'])

        expect(await runSearch('filego', 5)).toMatchInlineSnapshot(`
          [
            "go-has-parts",
            "file.go",
          ]
        `)

        expect(vscode.workspace.findFiles).toBeCalledTimes(1)
    })

    it('ranks bin/ low if "bin" has not been typed', async () => {
        setFiles(['bin/main.dart', 'abcdefghijbklmn.dart'])

        expect(await runSearch('bi', 5)).toMatchInlineSnapshot(`
          [
            "abcdefghijbklmn.dart",
            "main.dart",
          ]
        `)

        expect(vscode.workspace.findFiles).toBeCalledTimes(1)
    })

    it('ranks bin/ normally if "bin" has been typed', async () => {
        setFiles(['bin/main.dart', 'abcdefghijbklmn.dart'])

        expect(await runSearch('bin', 5)).toMatchInlineSnapshot(`
          [
            "main.dart",
            "abcdefghijbklmn.dart",
          ]
        `)

        expect(vscode.workspace.findFiles).toBeCalledTimes(1)
    })

    it('filters out ignored files', async () => {
        ignores.setActiveState(true)
        ignores.setIgnoreFiles(testFileUri('').fsPath, [
            { filePath: testFileUri('.cody/ignore').fsPath, content: '*.ignore' },
        ])
        setFiles(['foo.txt', 'foo.ignore'])

        // Match the .txt but not the .ignore
        expect(await runSearch('foo', 5)).toMatchInlineSnapshot(`
          [
            "foo.txt",
          ]
        `)

        expect(vscode.workspace.findFiles).toBeCalledTimes(1)
    })

    it('cancels previous requests', async () => {
        vscode.workspace.findFiles = vi.fn().mockResolvedValueOnce([])
        const cancellation = new vscode.CancellationTokenSource()
        await getFileContextFiles('search', 5, cancellation.token)
        await getFileContextFiles('search', 5, new vscode.CancellationTokenSource().token)
        expect(cancellation.token.isCancellationRequested)
        expect(vscode.workspace.findFiles).toBeCalledTimes(2)
    })
})
