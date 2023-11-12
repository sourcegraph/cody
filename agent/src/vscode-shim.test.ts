import assert from 'assert'
import * as path from 'path'

import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

describe('vscode-shim', () => {
    describe('vscode.Uri', () => {
        it('static file() is available', () => {
            assert.equal(vscode.Uri.file('a.txt').toString(), 'file:///a.txt')
        })

        it('static from() is available', () => {
            assert.equal(vscode.Uri.from({ scheme: 'file', path: '/a.txt' }).toString(), 'file:///a.txt')
        })

        it('static joinPath() is available', () => {
            assert.equal(
                vscode.Uri.joinPath(vscode.Uri.parse('http://example.org'), 'one', 'two').toString(),
                'http://example.org/one/two'
            )
        })

        it('static parse() is available', () => {
            assert.equal(vscode.Uri.parse('http://example.org').toString(), 'http://example.org/')
        })

        it('fsPath is available', () => {
            assert.equal(vscode.Uri.file('a.txt').fsPath, `${path.sep}a.txt`)
        })

        it('with is available', () => {
            assert.equal(vscode.Uri.file('a.txt').with({ path: 'b.txt' }).path, '/b.txt')
        })

        it('instanceof can be used', () => {
            // eslint-disable-next-line @typescript-eslint/no-extraneous-class
            class Qux {}

            assert.ok(vscode.Uri.parse('http://example.org/one/two') instanceof vscode.Uri)
            expect(new Qux() instanceof vscode.Uri).toBe(false)

            expect(vscode.Uri.parse('http://example.org/one/two') instanceof Qux).toBe(false)

            expect(vscode.Uri.parse('http://example.org/one/two') instanceof URI).toBe(false)
            expect(vscode.Uri.file('a.txt').with({ path: 'b.txt' }) instanceof vscode.Uri).toBe(true)
            expect(vscode.Uri.file('a.txt').with({ path: 'b.txt' }) instanceof URI).toBe(false)
        })
    })
})

describe('vscode.workspace.fs', () => {
    it('stat', async () => {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.parse('file:///tmp'))
        expect(stat.type).toBe(vscode.FileType.Directory)
    })
    it('readDirectory', async () => {
        const readDirectory = await vscode.workspace.fs.readDirectory(vscode.Uri.parse('file:///tmp'))
        console.log(readDirectory)
    })
    it('createDirectory', async () => {
        await vscode.workspace.fs.createDirectory(vscode.Uri.parse('file:///tmp/cody-vscode-shim-test'))
        const stat = await vscode.workspace.fs.stat(vscode.Uri.parse('file:///tmp/cody-vscode-shim-test'))
        expect(stat.type).toBe(vscode.FileType.Directory)
    })
    it('writeFile', async () => {
        const data = new Uint8Array(Buffer.from('Hello'))
        await vscode.workspace.fs.writeFile(vscode.Uri.parse('file:///tmp/cody-vscode-shim-test/file'), data)
        const content = await vscode.workspace.fs.readFile(vscode.Uri.parse('file:///tmp/cody-vscode-shim-test/file'))
        expect(content).toEqual(data)
    })
    it('readFile', async () => {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.parse('file:///tmp/cody-vscode-shim-test/file'))
        expect(content).toEqual(new Uint8Array(Buffer.from('Hello')))
    })
    it('copy', async () => {
        const source = vscode.Uri.parse('file:///tmp/cody-vscode-shim-test/file')
        const target = vscode.Uri.parse('file:///tmp/cody-vscode-shim-test/oldFile')
        await vscode.workspace.fs.copy(source, target)
        const content = await vscode.workspace.fs.readFile(target)
        expect(content).toEqual(new Uint8Array(Buffer.from('Hello')))
    })
    it('delete with useTrash set to false', async () => {
        await vscode.workspace.fs.delete(vscode.Uri.parse('file:///tmp/cody-vscode-shim-test/file'), {
            useTrash: false,
        })
        await expect(
            vscode.workspace.fs.stat(vscode.Uri.parse('file:///tmp/cody-vscode-shim-test/file'))
        ).rejects.toThrow()
    })
    it('rename', async () => {
        const oldPath = vscode.Uri.parse('file:///tmp/cody-vscode-shim-test/oldFile')
        const newPath = vscode.Uri.parse('file:///tmp/cody-vscode-shim-test/newFile')
        await vscode.workspace.fs.rename(oldPath, newPath)
        const content = await vscode.workspace.fs.readFile(newPath)
        expect(content).toEqual(new Uint8Array(Buffer.from('Hello')))
        await expect(vscode.workspace.fs.stat(oldPath)).rejects.toThrow()
    })
    it('delete recursive with useTrash set to false', async () => {
        await vscode.workspace.fs.delete(vscode.Uri.parse('file:///tmp/cody-vscode-shim-test/'), {
            recursive: true,
            useTrash: false,
        })
        await expect(vscode.workspace.fs.stat(vscode.Uri.parse('file:///tmp/cody-vscode-shim-test/'))).rejects.toThrow()
    })
    it('isWritableFileSystem', () => {
        expect(vscode.workspace.fs.isWritableFileSystem('file')).toBe(true)
    })
})
