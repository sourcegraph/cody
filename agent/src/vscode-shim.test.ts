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
        const stat = await vscode.workspace.fs.stat(vscode.Uri.parse('file:/tmp'))
        expect(stat.type).toBe(vscode.FileType.Directory)
    })
    it('readDirectory', async () => {
        const readDirectory = await vscode.workspace.fs.readDirectory(vscode.Uri.parse('file:/tmp'))
        console.log(readDirectory)
    })
    it('createDirectory', async () => {
        await vscode.workspace.fs.createDirectory(vscode.Uri.parse('file:/tmp/test'))
        const stat = await vscode.workspace.fs.stat(vscode.Uri.parse('file:/tmp/test'))
        expect(stat.type).toBe(vscode.FileType.Directory)
    })
    it('readFile', async () => {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.parse('file:/tmp/path/to/file'))
        expect(content).toEqual(new Uint8Array(Buffer.from('Hello')))
    })
    it('writeFile', async () => {
        const data = new Uint8Array(Buffer.from('Hello'))
        await vscode.workspace.fs.writeFile(vscode.Uri.parse('file:/tmp/path/to/file'), data)
        const content = await vscode.workspace.fs.readFile(vscode.Uri.parse('file:/tmp/path/to/file'))
        expect(content).toEqual(data)
    })
})
