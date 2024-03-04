import { afterEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import {
    type ContextItemFile,
    MAX_CURRENT_FILE_TOKENS,
    ignores,
    testFileUri,
    uriBasename,
} from '@sourcegraph/cody-shared'

import { CHARS_PER_TOKEN } from '@sourcegraph/cody-shared/src/prompt/constants'
import { filterLargeFiles, getFileContextFiles } from './editor-context'

vi.mock('lodash/throttle', () => ({ default: vi.fn(fn => fn) }))

afterEach(() => {
    vi.clearAllMocks()
})

describe('getFileContextFiles', () => {
    function setFiles(relativePaths: string[]) {
        vscode.workspace.findFiles = vi
            .fn()
            .mockResolvedValueOnce(relativePaths.map(f => testFileUri(f)))

        for (const rp of relativePaths) {
            vscode.workspace.fs.stat = vi.fn().mockResolvedValue({
                size: rp.startsWith('large-file.') ? 10000000 : 10,
                type: rp === 'symlink' ? vscode.FileType.SymbolicLink : vscode.FileType.File,
                uri: testFileUri(rp),
                isDirectory: () => false,
                isFile: () => true,
                isSymbolicLink: () => false,
                toString: vi.fn().mockReturnValue(rp),
            })
        }
    }

    async function runSearch(query: string, maxResults: number): Promise<(string | undefined)[]> {
        const results = await getFileContextFiles(
            query,
            maxResults,
            new vscode.CancellationTokenSource().token
        )

        return results.map(f => uriBasename(f.uri))
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

    it('do not return non-file (e.g. symlinks) result', async () => {
        setFiles(['symlink'])

        expect(await runSearch('symlink', 5)).toMatchInlineSnapshot(`
          []
        `)

        expect(vscode.workspace.findFiles).toBeCalledTimes(1)
    })

    it('do not return file larger than 1MB', async () => {
        setFiles(['large-file.go'])

        expect(await runSearch('large', 5)).toMatchInlineSnapshot(`
          []
        `)

        expect(vscode.workspace.findFiles).toBeCalledTimes(1)
    })

    it('filters out ignored files', async () => {
        ignores.setActiveState(true)
        ignores.setIgnoreFiles(testFileUri(''), [
            { uri: testFileUri('.cody/ignore'), content: '*.ignore' },
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

describe('filterLargeFiles', () => {
    it('filters out files larger than 1MB', async () => {
        const largeFile = {
            uri: vscode.Uri.file('/large-file.txt'),
            type: 'file',
        } as ContextItemFile
        vscode.workspace.fs.stat = vi.fn().mockResolvedValueOnce({
            size: 1000001,
            type: vscode.FileType.File,
        } as any)

        const filtered = await filterLargeFiles([largeFile])

        expect(filtered).toEqual([])
    })

    it('filters out non-text files', async () => {
        const binaryFile = {
            uri: vscode.Uri.file('/binary.bin'),
            type: 'file',
        } as ContextItemFile
        vscode.workspace.fs.stat = vi.fn().mockResolvedValueOnce({
            size: 100,
            type: vscode.FileType.SymbolicLink,
        } as any)

        const filtered = await filterLargeFiles([binaryFile])

        expect(filtered).toEqual([])
    })

    it('sets title to large-file for files exceeding token limit', async () => {
        const largeTextFile = {
            uri: vscode.Uri.file('/large-text.txt'),
            type: 'file',
        } as ContextItemFile
        vscode.workspace.fs.stat = vi.fn().mockResolvedValueOnce({
            size: MAX_CURRENT_FILE_TOKENS * CHARS_PER_TOKEN + 1,
            type: vscode.FileType.File,
        } as any)

        const filtered = await filterLargeFiles([largeTextFile])

        expect(filtered[0].title).toEqual('large-file')
    })
})
