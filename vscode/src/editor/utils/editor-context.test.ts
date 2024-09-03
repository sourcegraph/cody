import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import {
    type ContextItem,
    type ContextItemFile,
    EXTENDED_USER_CONTEXT_TOKEN_BUDGET,
    type Editor,
    contextFiltersProvider,
    ignores,
    ps,
    testFileUri,
    uriBasename,
} from '@sourcegraph/cody-shared'

import { filterContextItemFiles, getFileContextFiles, resolveContextItems } from './editor-context'

vi.mock('lodash/throttle', () => ({ default: vi.fn(fn => fn) }))

afterEach(() => {
    vi.clearAllMocks()
})

describe('getFileContextFiles', () => {
    beforeEach(() => {
        vi.spyOn(contextFiltersProvider.instance!, 'isUriIgnored').mockResolvedValue(false)
    })
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
        const results = await getFileContextFiles({
            query,
            maxResults,
            range: undefined,
        })

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
})

describe('filterContextItemFiles', () => {
    it('filters out files larger than 1MB', async () => {
        const largeFile: ContextItemFile = {
            uri: vscode.Uri.file('/large-file.txt'),
            type: 'file',
        }
        vscode.workspace.fs.stat = vi.fn().mockResolvedValueOnce({
            size: 1000001,
            type: vscode.FileType.File,
        } as vscode.FileStat)

        const filtered = await filterContextItemFiles([largeFile])

        expect(filtered).toEqual([])
    })

    it('filters out non-text files', async () => {
        const binaryFile: ContextItemFile = {
            uri: vscode.Uri.file('/binary.bin'),
            type: 'file',
        }
        vscode.workspace.fs.stat = vi.fn().mockResolvedValueOnce({
            size: 100,
            type: vscode.FileType.SymbolicLink,
        } as vscode.FileStat)

        const filtered = await filterContextItemFiles([binaryFile])

        expect(filtered).toEqual([])
    })

    it('convert file size in bytes to token for files exceeding token limit but under 1MB', async () => {
        const largeTextFile: ContextItemFile = {
            uri: vscode.Uri.file('/large-text.txt'),
            type: 'file',
        }
        const fsSizeInBytes = EXTENDED_USER_CONTEXT_TOKEN_BUDGET * 4 + 100
        vscode.workspace.fs.stat = vi.fn().mockResolvedValueOnce({
            size: fsSizeInBytes,
            type: vscode.FileType.File,
        } as vscode.FileStat)

        const filtered = await filterContextItemFiles([largeTextFile])
        // Frontend expects the size to be in tokens units so that they can be compared with the available tokens
        // to set the isTooLarge field.
        expect(filtered[0]).toEqual<ContextItem>({
            type: 'file',
            uri: largeTextFile.uri,
            size: Math.floor(fsSizeInBytes / 4.5),
        })
    })
})

describe('resolveContextItems', () => {
    it('omits files that could not be read', async () => {
        // Fixes https://github.com/sourcegraph/cody/issues/2390.
        const mockEditor: Partial<Editor> = {
            getTextEditorContentForFile(uri) {
                if (uri.path === '/a.txt') {
                    return Promise.resolve('a')
                }
                throw new Error('error')
            },
        }
        const contextItems = await resolveContextItems(
            mockEditor as Editor,
            [
                {
                    type: 'file',
                    uri: URI.parse('file:///a.txt'),
                },
                {
                    type: 'file',
                    uri: URI.parse('file:///error.txt'),
                },
            ],
            ps``
        )
        expect(contextItems).toEqual<ContextItem[]>([
            {
                type: 'file',
                uri: URI.parse('file:///a.txt'),
                content: 'a',
                size: 1,
            },
        ])
    })
})
