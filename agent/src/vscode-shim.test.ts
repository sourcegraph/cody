import assert from 'node:assert'
import * as fspromises from 'node:fs/promises'
import os from 'node:os'
import * as path from 'node:path'

import { rimraf } from 'rimraf'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'

import { AgentWorkspaceConfiguration } from './AgentWorkspaceConfiguration'
import { AgentWorkspaceDocuments } from './AgentWorkspaceDocuments'
import * as vscode from './vscode-shim'
import { setWorkspaceFolders, workspaceFolders } from './vscode-shim'
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

    it('writeFile in non-existent directory', async () => {
        const testBuffer = Buffer.from('Hello')
        const nonExistentDir = path.join(tmpdir.fsPath, 'non-existent')
        const testFilePath = path.join(nonExistentDir, 'testFile')
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
            // vscode.workspaceFolders will be reset by setWorkspaceDocuments.
        }
        workspaceDocuments.workspaceRootUri = tmpdir
        vscode.setWorkspaceDocuments(workspaceDocuments)
        expect(vscode.workspaceFolders.length).toEqual(1)
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

    it('findFiles(RelativePattern(workspaceFolder, "**.sh"))', async () => {
        // TODO(dantup): add tests for multiple WorkspaceFolders to ensure the
        //  filter actually works if/when we support multiple workspace folders.
        const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(vscode.workspaceFolders[0], '**/*.sh'),
            undefined,
            undefined
        )
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

describe('vscode_shim.onDidChangeWorkspaceFolders', () => {
    let originalWorkspaceFolders = [...workspaceFolders]

    beforeEach(() => {
        originalWorkspaceFolders = [...workspaceFolders]
        workspaceFolders.length = 0
    })

    afterEach(() => {
        workspaceFolders.length = 0
        workspaceFolders.push(...originalWorkspaceFolders)
    })

    it('adds a new workspace folder when array is empty', () => {
        const uri = vscode.Uri.file('/test/workspace')
        const result = setWorkspaceFolders([uri])
        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({
            name: 'workspace',
            uri,
            index: 0,
        })
    })

    it('removes a workspace folder', () => {
        const uri1 = vscode.Uri.file('/test/workspace1')
        const uri2 = vscode.Uri.file('/test/workspace2')
        workspaceFolders.push(
            { name: 'workspace1', uri: uri1, index: 0 },
            { name: 'workspace2', uri: uri2, index: 1 }
        )

        const result = setWorkspaceFolders([uri2])
        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({
            name: 'workspace2',
            uri: uri2,
            index: 0,
        })
    })

    it('updates indexes when removing a workspace folder', () => {
        const uri1 = vscode.Uri.file('/test/workspace1')
        const uri2 = vscode.Uri.file('/test/workspace2')
        const uri3 = vscode.Uri.file('/test/workspace3')
        workspaceFolders.push(
            { name: 'workspace1', uri: uri1, index: 0 },
            { name: 'workspace2', uri: uri2, index: 1 },
            { name: 'workspace3', uri: uri3, index: 2 }
        )

        const result = setWorkspaceFolders([uri1, uri3])
        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({
            name: 'workspace1',
            uri: uri1,
            index: 0,
        })
        expect(result[1]).toEqual({
            name: 'workspace3',
            uri: uri3,
            index: 1,
        })
    })

    it('adds a new workspace folder to existing folders', () => {
        const uri1 = vscode.Uri.file('/test/workspace1')
        const uri2 = vscode.Uri.file('/test/workspace2')
        workspaceFolders.push({ name: 'workspace2', uri: uri2, index: 0 })

        const result = setWorkspaceFolders([uri1, uri2])
        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({
            name: 'workspace2',
            uri: uri2,
            index: 0,
        })
        expect(result[1]).toEqual({
            name: 'workspace1',
            uri: uri1,
            index: 1,
        })
    })

    it('returns an empty array when removing the last workspace folder', () => {
        const uri = vscode.Uri.file('/test/workspace')
        workspaceFolders.push({ name: 'workspace', uri, index: 0 })

        const result = setWorkspaceFolders([])
        expect(result).toHaveLength(0)
    })
})

describe('vscode.workspace.getConfiguration', () => {
    let configuration: AgentWorkspaceConfiguration

    const clientInfo = {
        name: 'vscode',
        version: '1.0.0',
        ideVersion: '1.80.0',
        workspaceRootUri: '/',
    }

    const customConfigJson = `
        {
          "cody.experimental.noodle": true,
          "openctx": {
            "providers": {
              "https://gist.githubusercontent.com/someuser/provider.js": true
            },
            "enable": true
          }
        }
    `

    const extensionConfig = {
        serverEndpoint: 'https://sourcegraph.test',
        customHeaders: { 'X-Test': 'test' },
        telemetryClientName: 'test-client',
        autocompleteAdvancedProvider: 'anthropic',
        autocompleteAdvancedModel: 'claude-2',
        verboseDebug: true,
        codebase: 'test-repo',
        customConfigurationJson: customConfigJson,
    }

    beforeEach(() => {
        configuration = new AgentWorkspaceConfiguration(
            [],
            () => clientInfo,
            () => extensionConfig
        )
        vscode.setClientInfo(clientInfo)
        vscode.setExtensionConfiguration(extensionConfig)
    })

    it('returns full configuration when section is undefined', () => {
        const newConfig = vscode.workspace.getConfiguration()
        expect(newConfig.get('openctx')).toMatchObject(configuration.get('openctx'))
    })

    it('returns scoped configuration for valid section', () => {
        const newConfig = vscode.workspace.getConfiguration('openctx')
        expect(newConfig).toBeDefined()
        expect(newConfig.get('providers')).toMatchObject(configuration.get('openctx.providers'))
    })

    it('ignores scope parameter when section is undefined', () => {
        const newConfig = vscode.workspace.getConfiguration(undefined, vscode.Uri.file('/test'))
        expect(newConfig.get('openctx')).toMatchObject(configuration.get('openctx'))
    })

    it('falls back to global scope for language-scoped configuration', () => {
        const newConfig = vscode.workspace.getConfiguration('[jsonc]')
        expect(newConfig.get('openctx')).toMatchObject(configuration.get('openctx'))
    })

    it('handles nested section paths', () => {
        const config = vscode.workspace.getConfiguration('openctx.providers')
        expect(config).toBeDefined()
        expect(config.get('https://gist.githubusercontent.com/someuser/provider.js')).toMatchObject(
            configuration.get(
                'openctx.providers.https://gist.githubusercontent.com/someuser/provider.js'
            )
        )
    })

    it('returns same configuration regardless of scope when section is defined', () => {
        const configNoScope = vscode.workspace.getConfiguration('openctx')
        const configWithScope = vscode.workspace.getConfiguration('openctx', vscode.Uri.file('/test'))
        expect(configNoScope.get('providers')).toEqual(configWithScope.get('providers'))
    })
})
