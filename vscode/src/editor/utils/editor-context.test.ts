import { afterEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { ignores, testFileUri, uriBasename } from '@sourcegraph/cody-shared'

import { getFileContextFiles } from './editor-context'

vi.mock('lodash/throttle', () => ({ default: vi.fn(fn => fn) }))

afterEach(() => {
    vi.clearAllMocks()
})

describe('getFileContextFiles', () => {
    /**
     * Mocks the fs.stat function to return a fake stat object for the given URI.
     * This allows tests to mock filesystem access for specific files.
     */
    function setFileStat(uri: vscode.Uri, isFile = true) {
        vscode.workspace.fs.stat = vi.fn().mockImplementation(() => {
            const relativePath = uriBasename(uri)
            return {
                type: isFile ? vscode.FileType.File : vscode.FileType.SymbolicLink,
                ctime: 1,
                mtime: 1,
                size: 1,
                isDirectory: () => false,
                isFile: () => isFile,
                isSymbolicLink: () => !isFile,
                uri,
                with: vi.fn(),
                toString: vi.fn().mockReturnValue(relativePath),
            }
        })
    }

    function setFiles(relativePaths: string[]) {
        vscode.workspace.findFiles = vi
            .fn()
            .mockResolvedValueOnce(relativePaths.map(f => testFileUri(f)))

        for (const relativePath of relativePaths) {
            const isFile = relativePath !== 'symlink'
            setFileStat(testFileUri(relativePath), isFile)
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
