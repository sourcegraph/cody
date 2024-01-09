import * as child_process from 'child_process'
import * as fs from 'fs'
import * as fspromises from 'fs/promises'
import path from 'path'
import * as util from 'util'

import envPaths from 'env-paths'
import * as rimraf from 'rimraf'
import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import { BfgRetriever } from '../../../vscode/src/completions/context/retrievers/bfg/bfg-retriever'
import { getCurrentDocContext } from '../../../vscode/src/completions/get-current-doc-context'
import { initTreeSitterParser } from '../../../vscode/src/completions/test-helpers'
import { TextDocumentWithUri } from '../../../vscode/src/jsonrpc/TextDocumentWithUri'
import { initializeVscodeExtension, newEmbeddedAgentClient } from '../agent'
import * as vscode_shim from '../vscode-shim'

const exec = util.promisify(child_process.exec)

let dir = path.join(process.cwd(), 'agent', 'src', 'bfg', '__tests__', 'typescript')
if (!fs.existsSync(dir)) {
    dir = path.join(process.cwd(), 'src', 'bfg', '__tests__', 'typescript')
}
const bfgCratePath = process.env.BFG_CRATE_PATH
const testFile = path.join('src', 'main.ts')
const gitdir = path.join(dir, '.git')
const shouldCreateGitDir = !fs.existsSync(gitdir)

describe('BfgRetriever', async () => {
    if (process.env.BFG_TEST !== 'true') {
        it('Skipping BFG tests because they are disabled in CI for now. To run the tests manually locally, set BFG_TEST=true.', () => {})
        return
    }
    beforeAll(async () => {
        process.env.CODY_TESTING = 'true'
        await initTreeSitterParser()
        await initializeVscodeExtension(vscode.Uri.file(process.cwd()))

        if (shouldCreateGitDir) {
            await exec('git init', { cwd: dir })
            await exec('git add .', { cwd: dir })
            await exec('git commit -m "First commit"', { cwd: dir })
        }

        if (bfgCratePath && process.env.BFG_BUILD === 'true') {
            await exec('cargo build', { cwd: bfgCratePath })
        }
    })
    afterAll(async () => {
        if (shouldCreateGitDir) {
            await rimraf.rimraf(gitdir)
        }
    })

    const rootUri = vscode.Uri.from({ scheme: 'file', path: gitdir })
    vscode_shim.addGitRepository(rootUri, 'asdf')
    const agent = await newEmbeddedAgentClient({
        name: 'BfgContextFetcher',
        version: '0.1.0',
        workspaceRootUri: rootUri.toString(),
        extensionConfiguration: {
            accessToken: '',
            serverEndpoint: '',
            customHeaders: {},
            customConfiguration: {
                'cody.experimental.cody-engine.await-indexing': true,
            },
        },
    })
    const client = agent.clientForThisInstance()

    const filePath = path.join(dir, testFile)
    const uri = vscode.Uri.file(filePath)
    const content = await fspromises.readFile(filePath, 'utf8')
    const CURSOR = '/*CURSOR*/'
    it('returns non-empty context', async () => {
        if (bfgCratePath) {
            const bfgBinary = path.join(bfgCratePath, '..', '..', 'target', 'debug', 'bfg')
            vscode_shim.setExtensionConfiguration({
                accessToken: '',
                serverEndpoint: '',
                customHeaders: {},
                customConfiguration: { 'cody.experimental.bfg.path': bfgBinary },
            })
        }
        const paths = envPaths('Cody')
        const extensionContext: Partial<vscode.ExtensionContext> = {
            subscriptions: [],
            globalStorageUri: vscode.Uri.file(paths.data),
        }
        client.notify('textDocument/didOpen', {
            uri: uri.toString(),
            content: content.replace(CURSOR, ''),
        })

        const bfg = new BfgRetriever(extensionContext as vscode.ExtensionContext)

        const document = agent.workspace.getDocument(new TextDocumentWithUri(uri).uri)!
        assert(document.getText().length > 0)
        const offset = content.indexOf(CURSOR)
        assert(offset >= 0, content)
        const position = document.positionAt(offset)
        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 10_000,
            maxSuffixLength: 1_000,
            dynamicMultilineCompletions: false,
        })
        const maxChars = 1_000
        const maxMs = 100

        const actual = await bfg.retrieve({ document, position, docContext, hints: { maxChars, maxMs } })
        actual.sort((a, b) => a.content.localeCompare(b.content))

        expect(actual).toMatchInlineSnapshot([
            {
                content: 'function distance(a: Point, b: Point): number  { ... }',
                fileName: 'src/Point.ts',
                symbol: 'scip-ctags . . . src/`Point.ts`/distance().',
            },
            {
                content: 'interface Point {\n    x: number\n    y: number\n}',
                fileName: 'src/Point.ts',
                symbol: 'scip-ctags . . . src/`Point.ts`/Point#',
            },
        ])
    })
})
