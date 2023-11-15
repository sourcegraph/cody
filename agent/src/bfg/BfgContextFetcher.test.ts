import * as child_process from 'child_process'
import * as fs from 'fs'
import * as fspromises from 'fs/promises'
import * as os from 'os'
import path from 'path'
import * as util from 'util'

import * as rimraf from 'rimraf'
import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import { bfgIndexingPromise, BfgRetriever } from '../../../vscode/src/completions/context/retrievers/bfg/bfg-retriever'
import { getCurrentDocContext } from '../../../vscode/src/completions/get-current-doc-context'
import { initTreeSitterParser } from '../../../vscode/src/completions/test-helpers'
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
    if (process.env.SRC_ACCESS_TOKEN === undefined || process.env.SRC_ENDPOINT === undefined) {
        // The test runs successfully without these environment variables. We
        // only have this check enabled for now to skip running BFG tests in CI.
        // We should prioritize figuring out how to enable these tests to run in
        // CI alongside other agent tests.
        it('no-op test because SRC_ACCESS_TOKEN is not set. To actually run BFG tests, set the environment variables SRC_ENDPOINT and SRC_ACCESS_TOKEN', () => {})
        return
    }
    const tmpDir = await fspromises.mkdtemp(path.join(os.tmpdir(), 'bfg-'))
    beforeAll(async () => {
        process.env.CODY_TESTING = 'true'
        await initTreeSitterParser()
        initializeVscodeExtension(vscode.Uri.file(process.cwd()))

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
    })
    const client = agent.clientForThisInstance()

    const filePath = path.join(dir, testFile)
    const content = await fspromises.readFile(filePath, 'utf8')
    const CURSOR = '/*CURSOR*/'
    it('returns non-empty context', async () => {
        if (bfgCratePath) {
            const bfgBinary = path.join(bfgCratePath, '..', '..', 'target', 'debug', 'bfg')
            vscode_shim.customConfiguration['cody.experimental.bfg.path'] = bfgBinary
        }
        const extensionContext: Partial<vscode.ExtensionContext> = {
            subscriptions: [],
            globalStorageUri: vscode.Uri.from({ scheme: 'file', path: tmpDir }),
        }
        client.notify('textDocument/didOpen', {
            filePath,
            content: content.replace(CURSOR, ''),
        })

        const bfg = new BfgRetriever(extensionContext as vscode.ExtensionContext)

        await bfgIndexingPromise

        const document = agent.workspace.agentTextDocument({ filePath })
        assert(document.getText().length > 0)
        const offset = content.indexOf(CURSOR)
        assert(offset >= 0, content)
        const position = document.positionAt(offset)
        const docContext = getCurrentDocContext({ document, position, maxPrefixLength: 10_000, maxSuffixLength: 1_000 })
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
