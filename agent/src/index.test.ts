import assert from 'assert'
import { execSync, spawn } from 'child_process'
import path from 'path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { Uri } from 'vscode'

import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'

import { WebviewMessage } from '../../vscode/src/chat/protocol'

import { MessageHandler } from './jsonrpc-alias'
import { ClientInfo } from './protocol-alias'

export class TestClient extends MessageHandler {
    constructor() {
        super()
        this.registerNotification('debug/message', message => {
            console.log(`${message.channel}: ${message.message}`)
        })
    }
    public async handshake(clientInfo: ClientInfo) {
        const info = await this.request('initialize', clientInfo)
        this.notify('initialized', null)
        return info
    }

    public listRecipes() {
        return this.request('recipes/list', null)
    }

    public async executeRecipe(id: RecipeID, humanChatInput: string) {
        return this.request('recipes/execute', {
            id,
            humanChatInput,
        })
    }

    public async shutdownAndExit() {
        await this.request('shutdown', null)
        this.notify('exit', null)
    }
}

const workspaceRootUri = 'file:///path/to/foo'
const dotcom = 'https://sourcegraph.com'
const clientInfo: ClientInfo = {
    name: 'test-client',
    version: 'v1',
    workspaceRootUri,
    workspaceRootPath: vscode.Uri.parse(workspaceRootUri).fsPath,
    extensionConfiguration: {
        anonymousUserID: 'abcde1234',
        accessToken: process.env.SRC_ACCESS_TOKEN ?? 'sgp_RRRRRRRREEEEEEEDDDDDDAAACCCCCTEEEEEEEDDD',
        serverEndpoint: dotcom,
        customHeaders: {},
        autocompleteAdvancedProvider: 'anthropic',
        autocompleteAdvancedAccessToken: '',
        autocompleteAdvancedServerEndpoint: '',
        debug: false,
        verboseDebug: false,
        codebase: 'github.com/sourcegraph/cody',
    },
}

const cwd = process.cwd()
const agentDir = path.basename(cwd) === 'agent' ? cwd : path.join(cwd, 'agent')
const recordingDirectory = path.join(agentDir, 'recordings')
const agentScript = path.join(agentDir, 'dist', 'index.js')

describe('Agent', () => {
    // Uncomment the code block below to disable agent tests. Feel free to do this to unblock
    // merging a PR if the agent tests are failing. If you decide to uncomment this block, please
    // post in #wg-cody-agent to let the team know the tests have been disabled so that we can
    // investigate the problem and get the passing again.
    // if (process.env.SRC_ACCESS_TOKEN === undefined || process.env.SRC_ENDPOINT === undefined) {
    //     it('no-op test because SRC_ACCESS_TOKEN is not set. To actually run the Cody Agent tests, set the environment variables SRC_ENDPOINT and SRC_ACCESS_TOKEN', () => {})
    //     return
    // }

    if (process.env.VITEST_ONLY && !process.env.VITEST_ONLY.includes('Agent')) {
        it('Agent tests are skipped due to VITEST_ONLY environment variable', () => {})
        return
    }
    const client = new TestClient()

    // Bundle the agent. When running `pnpm run test`, vitest doesn't re-run this step.
    execSync('pnpm run build', { cwd: agentDir, stdio: 'inherit' })

    if (process.env.CODY_RECORDING_MODE === 'record') {
        console.log('Because CODY_RECORDING_MODE=record, validating that you are authenticated to sourcegraph.com')
        execSync('src login', { stdio: 'inherit' })
        assert.strictEqual(
            process.env.SRC_ENDPOINT,
            clientInfo.extensionConfiguration?.serverEndpoint,
            'SRC_ENDPOINT must match clientInfo.extensionConfiguration.serverEndpoint'
        )
    }
    const agentProcess = spawn('node', ['--enable-source-maps', agentScript, 'jsonrpc'], {
        stdio: 'pipe',
        cwd: agentDir,
        env: {
            CODY_SHIM_TESTING: 'true',
            CODY_RECORDING_MODE: 'replay', // can be overwritten with process.env.CODY_RECORDING_MODE
            CODY_RECORDING_DIRECTORY: recordingDirectory,
            CODY_RECORDING_NAME: 'FullConfig',
            ...process.env,
        },
    })

    client.connectProcess(agentProcess)

    // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
    beforeAll(async () => {
        const serverInfo = await client.handshake(clientInfo)
        assert.deepStrictEqual(serverInfo.name, 'cody-agent', 'Agent should be cody-agent')
    })

    it('handles config changes correctly', () => {
        // Send two config change notifications because this is what the
        // JetBrains client does and there was a bug where everything worked
        // fine as long as we didn't send the second unauthenticated config
        // change.
        client.notify('extensionConfiguration/didChange', {
            ...clientInfo.extensionConfiguration,
            anonymousUserID: 'abcde1234',
            accessToken: '',
            serverEndpoint: 'https://sourcegraph.com/',
            customHeaders: {},
        })
        client.notify('extensionConfiguration/didChange', {
            ...clientInfo.extensionConfiguration,
            anonymousUserID: 'abcde1234',
            accessToken: clientInfo.extensionConfiguration?.accessToken ?? 'invalid',
            serverEndpoint: clientInfo.extensionConfiguration?.serverEndpoint ?? dotcom,
            customHeaders: {},
        })
    })

    it.skip('lists recipes correctly', async () => {
        const recipes = await client.listRecipes()
        assert.equal(9, recipes.length, JSON.stringify(recipes))
    })

    const filePath = path.join(workspaceRootUri, 'foo.ts')
    const uri = Uri.file(filePath)
    it('accepts textDocument/didOpen notifications', async () => {
        const content = 'function sum(a: number, b: number) {\n    \n}'
        client.notify('textDocument/didOpen', {
            uri: uri.toString(),
            content,
            selection: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
        })
    })

    it.skip('returns non-empty autocomplete', async () => {
        const completions = await client.request('autocomplete/execute', {
            uri: uri.toString(),
            position: { line: 1, character: 3 },
            triggerKind: 'Invoke',
        })
        const texts = completions.items.map(item => item.insertText)
        expect(completions.items.length).toBeGreaterThan(0)
        expect(texts).toMatchInlineSnapshot(`
          [
            "   return a + b;",
          ]
        `)
        client.notify('autocomplete/completionAccepted', { completionID: completions.items[0].id })
    }, 10_000)

    const messages: WebviewMessage[] = []
    client.registerNotification('webview/postMessage', ({ message }) => {
        messages.push(message)
    })

    it('allows us to execute recipes properly', async () => {
        const id = await client.request('chat/new', null)
        client.notify('webview/receiveMessage', {
            id,
            message: {
                command: 'submit',
                text: 'Hello',
                submitType: 'user',
                addEnhancedContext: true,
                contextFiles: [],
            },
        })
        // await client.request('recipes/execute', { humanChatInput: 'Hello', id: 'chat-question' })
        expect(messages).toMatchInlineSnapshot(`
          {
            "contextFiles": [],
            "preciseContext": [],
            "speaker": "assistant",
            "text": " Hello! I'm Cody, an AI assistant created by Sourcegraph to help with programming tasks. I don't have any context about the codebase or your questions yet, but I'm ready to assist you based on the information you provide. I won't make any assumptions or provide hypothetical examples without proper context. Please feel free to share code snippets or details about what you're working on, and I'll do my best to provide helpful answers!",
          }
        `)
    }, 20_000)

    // TODO Fix test - fails intermittently on macOS on Github Actions
    // e.g. https://github.com/sourcegraph/cody/actions/runs/7191096335/job/19585263054#step:9:1723
    it.skip('allows us to cancel chat', async () => {
        setTimeout(() => client.notify('$/cancelRequest', { id: client.id - 1 }), 300)
        await client.executeRecipe('chat-question', 'How do I implement sum?')
    }, 600)

    afterAll(async () => {
        await client.shutdownAndExit()
        // Long timeout because to allow Polly.js to persist HTTP recordings
    }, 20_000)
})
