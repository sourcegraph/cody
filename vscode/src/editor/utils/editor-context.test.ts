import { afterEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

// import { vsCodeMocks } from '../../testutils/mocks'
import { getFileContextFiles } from './editor-context'

vi.mock('lodash', () => ({
    throttle: vi.fn(fn => fn),
}))

afterEach(() => {
    vi.clearAllMocks()
})

describe('getFileContextFiles', () => {
    it('fuzzy filters results', async () => {
        vscode.workspace.findFiles = vi
            .fn()
            .mockResolvedValueOnce([
                vscode.Uri.parse('foo/bar/baz/file.go'),
                vscode.Uri.parse('foo/bar/File/go-has-parts'),
                vscode.Uri.parse('foo/bar/baz/FileWontMatch.ts'),
            ])

        expect(
            (await getFileContextFiles('filego', 5, new vscode.CancellationTokenSource().token)).map(uri => uri.path)
        ).toMatchInlineSnapshot(`
          [
            {
              "basename": "go-has-parts",
              "dirname": "/foo/bar/File",
              "relative": "/foo/bar/File/go-has-parts",
            },
            {
              "basename": "file.go",
              "dirname": "/foo/bar/baz",
              "relative": "/foo/bar/baz/file.go",
            },
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
