import assert from 'assert'
import * as fspromises from 'fs/promises'
import os from 'os'
import * as path from 'path'

import { rimraf } from 'rimraf'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'

import { AgentWorkspaceDocuments } from './AgentWorkspaceDocuments'
import * as vscode from './vscode-shim'

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

// Skipping vscode.workspace.fs tests on Windows for now since the assertions were failing
// Follow-up https://github.com/sourcegraph/cody/issues/2342
describe.skipIf(os.platform().startsWith('win'))('vscode.workspace.fs', () => {
    let tmpdir: URI

    beforeEach(async () => {
        const testFolderPath = await fspromises.mkdtemp(path.join(os.tmpdir(), 'cody-vscode-shim-test'))
        tmpdir = vscode.Uri.file(testFolderPath)
    })
    afterEach(async () => {
        await rimraf.rimraf(tmpdir.fsPath)
    })

    it('stat', async () => {
        const stat = await vscode.workspace.fs.stat(tmpdir)
        expect(stat.type).toBe(vscode.FileType.Directory)
    })

    it('readDirectory', async () => {
        const testDirPath = path.join(tmpdir.fsPath, 'testDir')
        const testFilePath = path.join(tmpdir.fsPath, 'testFile.txt')
        const testLinkPath = path.join(tmpdir.fsPath, 'testLink.txt')

        await fspromises.mkdir(testDirPath)
        await fspromises.writeFile(testFilePath, 'Hello')
        await fspromises.symlink(testFilePath, testLinkPath)

        const readDirectory = await vscode.workspace.fs.readDirectory(tmpdir)
        const expectedRead = [
            [path.basename(testDirPath), vscode.FileType.Directory],
            [path.basename(testFilePath), vscode.FileType.File],
            [path.basename(testLinkPath), vscode.FileType.SymbolicLink],
        ]
        expect(readDirectory.sort()).toEqual(expectedRead.sort())
    })

    it('createDirectory', async () => {
        const testDirPath = path.join(tmpdir.fsPath, 'testDir')
        await vscode.workspace.fs.createDirectory(vscode.Uri.parse(testDirPath))
        const stat = await fspromises.stat(testDirPath)
        expect(stat.isDirectory()).toBe(true)
    })

    it('writeFile', async () => {
        const testBuffer = Buffer.from('Hello')
        const testFilePath = path.join(tmpdir.fsPath, 'testFile')
        await vscode.workspace.fs.writeFile(vscode.Uri.parse(testFilePath), new Uint8Array(testBuffer))
        const content = await fspromises.readFile(testFilePath)
        expect(content).toEqual(testBuffer)
    })

    it('readFile', async () => {
        const testFilePath = path.join(tmpdir.fsPath, 'testFile')
        await fspromises.writeFile(testFilePath, 'Hello')
        const content = await vscode.workspace.fs.readFile(vscode.Uri.parse(testFilePath))
        expect(content).toEqual(new Uint8Array(await fspromises.readFile(testFilePath)))
    })

    it('copy', async () => {
        const testFilePath = path.join(tmpdir.fsPath, 'testFile')
        await fspromises.writeFile(testFilePath, 'Hello')
        const copiedPath = path.join(tmpdir.fsPath, 'copiedFile')
        await vscode.workspace.fs.copy(vscode.Uri.parse(testFilePath), vscode.Uri.parse(copiedPath))
        expect(await fspromises.readFile(copiedPath)).toEqual(await fspromises.readFile(testFilePath))
    })

    it('delete', async () => {
        const testFilePath = path.join(tmpdir.fsPath, 'testFile')
        await fspromises.writeFile(testFilePath, 'Hello')
        await vscode.workspace.fs.delete(vscode.Uri.parse(testFilePath))
        await expect(fspromises.stat(testFilePath)).rejects.toThrow()
    })

    it('recursive delete', async () => {
        const testFilePath = path.join(tmpdir.fsPath, 'testFile')
        await fspromises.writeFile(testFilePath, 'Hello')
        await vscode.workspace.fs.delete(tmpdir, {
            recursive: true,
        })
        await expect(fspromises.stat(tmpdir.fsPath)).rejects.toThrow()
    })

    it('rename', async () => {
        const testFilePath = path.join(tmpdir.fsPath, 'testFile')
        await fspromises.writeFile(testFilePath, 'Hello')
        const renamedPath = path.join(tmpdir.fsPath, 'renamedFile')
        await vscode.workspace.fs.rename(vscode.Uri.parse(testFilePath), vscode.Uri.parse(renamedPath))
        expect(await fspromises.readdir(tmpdir.fsPath)).toHaveLength(1)
        expect(await fspromises.readFile(renamedPath)).toEqual(Buffer.from('Hello'))
    })

    it('rename with overwrite', async () => {
        const testFilePath = path.join(tmpdir.fsPath, 'testFile')
        await fspromises.writeFile(testFilePath, 'Hello')
        const renamedPath = path.join(tmpdir.fsPath, 'renamedFile')
        await fspromises.writeFile(renamedPath, 'Hello')
        await vscode.workspace.fs.rename(vscode.Uri.parse(testFilePath), vscode.Uri.parse(renamedPath), {
            overwrite: true,
        })
        expect(await fspromises.readdir(tmpdir.fsPath)).toHaveLength(1)
        expect(await fspromises.readFile(renamedPath)).toEqual(Buffer.from('Hello'))
    })

    it('isWritableFileSystem', () => {
        expect(vscode.workspace.fs.isWritableFileSystem('file')).toBe(true)
    })
})

describe('vscode.workspace.findFiles', () => {
    let tmpdir: URI

    beforeEach(async () => {
        const testFolderPath = await fspromises.mkdtemp(path.join(os.tmpdir(), 'cody-vscode-shim-test'))
        tmpdir = vscode.Uri.file(testFolderPath)
        const workspaceDocuments = new AgentWorkspaceDocuments()
        while (vscode.workspaceFolders.pop()) {
            // clear
        }
        workspaceDocuments.workspaceRootUri = tmpdir
        vscode.setWorkspaceDocuments(workspaceDocuments)
        await fspromises.writeFile(path.join(tmpdir.fsPath, 'README.md'), '# Bananas are great')
        await fspromises.writeFile(path.join(tmpdir.fsPath, 'other.txt'), 'Other file')
        await fspromises.mkdir(path.join(tmpdir.fsPath, 'scripts'))
        await fspromises.writeFile(path.join(tmpdir.fsPath, 'scripts', 'hello.sh'), 'echo Hello')
    })
    afterEach(async () => {
        await rimraf.rimraf(tmpdir.fsPath)
    })
    it('findFiles(README)', async () => {
        const readmeGlobalPattern = '{README,README.,readme.,Readm.}*'
        const files = await vscode.workspace.findFiles(readmeGlobalPattern, undefined, 1)
        expect(files.map(file => file.fsPath)).toEqual([path.join(tmpdir.fsPath, 'README.md')])
    })

    function relativize(file: URI): string {
        return path.relative(tmpdir.fsPath, file.fsPath).replaceAll('\\', '/')
    }

    it('findFiles("")', async () => {
        const files = await vscode.workspace.findFiles('', undefined, undefined)
        expect(files.map(relativize).sort()).toMatchInlineSnapshot(`
          [
            "README.md",
            "other.txt",
            "scripts/hello.sh",
          ]
        `)
    })

    it('findFiles("**.sh")', async () => {
        const files = await vscode.workspace.findFiles('**/*.sh', undefined, undefined)
        expect(files.map(relativize)).toMatchInlineSnapshot(`
          [
            "scripts/hello.sh",
          ]
        `)
    })

    it('findFiles(exclude="**.sh")', async () => {
        const files = await vscode.workspace.findFiles('', '**/*.sh', undefined)
        expect(files.map(relativize).sort()).toMatchInlineSnapshot(`
          [
            "README.md",
            "other.txt",
          ]
        `)
    })

    it('findFiles(maxResults)', async () => {
        const files = await vscode.workspace.findFiles('', undefined, 2)
        expect(files.map(relativize).sort()).toMatchInlineSnapshot(`
          [
            "README.md",
            "other.txt",
          ]
        `)
    })
})
