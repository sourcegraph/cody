import assert from 'assert'
import { execSync, spawn } from 'child_process'
import path from 'path'

import { afterAll, describe, it } from 'vitest'

import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'

import { MessageHandler } from './jsonrpc'
import { ClientInfo } from './protocol'

export class TestClient extends MessageHandler {
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

describe.each([
    {
        name: 'FullConfig',
        clientInfo: {
            name: 'test-client',
            version: 'v1',
            workspaceRootUri: 'file:///path/to/foo',
            workspaceRootPath: '/path/to/foo',
            connectionConfiguration: {
                accessToken: process.env.SRC_ACCESS_TOKEN ?? 'invalid',
                serverEndpoint: process.env.SRC_ENDPOINT ?? 'invalid',
                customHeaders: {},
                autocompleteAdvancedProvider: 'anthropic',
                autocompleteAdvancedAccessToken: '',
                autocompleteAdvancedServerEndpoint: '',
                autocompleteAdvancedServerModel: null,
                debug: false,
                verboseDebug: false,
            },
        },
    },
    {
        name: 'MinimalConfig',
        clientInfo: {
            name: 'test-client',
            version: 'v1',
            workspaceRootUri: 'file:///path/to/foo',
            workspaceRootPath: '/path/to/foo',
            connectionConfiguration: {
                accessToken: process.env.SRC_ACCESS_TOKEN ?? 'invalid',
                serverEndpoint: process.env.SRC_ENDPOINT ?? 'invalid',
                customHeaders: {},
            },
        },
    },
    {
        name: 'NotConfigured',
        clientInfo: {
            name: 'test-client',
            version: 'v1',
            workspaceRootUri: 'file:///path/to/foo',
            workspaceRootPath: '/path/to/foo',
            connectionConfiguration: {
                accessToken: '',
                serverEndpoint: 'https://sourcegraph.com/',
                customHeaders: {},
            },
        },
    },
])('describe StandardAgent with $name', ({ name, clientInfo }) => {
    if (process.env.VITEST_ONLY && !process.env.VITEST_ONLY.includes(name)) {
        it(name + ' tests are skipped due to VITEST_ONLY environment variable', () => {})
        return
    }
    if (process.env.SRC_ACCESS_TOKEN === undefined || process.env.SRC_ENDPOINT === undefined) {
        it('no-op test because SRC_ACCESS_TOKEN is not set. To actually run the Cody Agent tests, set the environment variables SRC_ENDPOINT and SRC_ACCESS_TOKEN', () => {})
        return
    }
    const client = new TestClient()

    // Bundle the agent. When running `pnpm run test`, vitest doesn't re-run this step.
    execSync('pnpm run build')

    const agentProcess = spawn('node', ['--inspect', path.join(__dirname, '../dist/index.js'), '--inspect'], {
        stdio: 'pipe',
    })

    agentProcess.stdout.pipe(client.messageDecoder)
    client.messageEncoder.pipe(agentProcess.stdin)
    agentProcess.stderr.on('data', msg => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        console.log(msg.toString())
    })

    it('initializes properly', async () => {
        const serverInfo = await client.handshake(clientInfo)
        assert.deepStrictEqual(serverInfo.name, 'cody-agent', 'Agent should be cody-agent')
    })

    it('handles config changes correctly', () => {
        // Send two config change notifications because this is what the
        // JetBrains client does and there was a bug where everything worked
        // fine as long as we didn't send the second unauthenticated config
        // change.
        client.notify('extensionConfiguration/didChange', {
            accessToken: 'https://sourcegraph.com/',
            serverEndpoint: '',
            customHeaders: {},
        })
        client.notify('extensionConfiguration/didChange', {
            accessToken: process.env.SRC_ACCESS_TOKEN ?? 'invalid',
            serverEndpoint: process.env.SRC_ENDPOINT ?? 'invalid',
            customHeaders: {},
        })
    })

    it('lists recipes correctly', async () => {
        const recipes = await client.listRecipes()
        assert.equal(9, recipes.length)
    })

    it('returns non-empty autocomplete', async () => {
        const filePath = '/path/to/foo/file.js'
        const content = 'function sum(a, b) {\n    \n}'
        client.notify('textDocument/didOpen', {
            filePath,
            content,
            selection: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
        })
        const completions = await client.request('autocomplete/execute', {
            filePath,
            position: { line: 1, character: 4 },
            triggerKind: 'Automatic',
        })
        assert(completions.items.length > 0)
    })

    const streamingChatMessages = new Promise<void>((resolve, reject) => {
        let hasReceivedNonNullMessage = false
        let isResolved = false
        client.registerNotification('chat/updateMessageInProgress', msg => {
            if (msg === null) {
                if (isResolved) {
                    return
                }
                isResolved = true
                if (hasReceivedNonNullMessage) {
                    resolve()
                } else {
                    reject(new Error('Received null message before non-null message'))
                }
            } else {
                hasReceivedNonNullMessage = true
            }
        })
    })

    it('allows us to execute recipes properly', async () => {
        await client.executeRecipe('chat-question', 'How do I implement sum?')
    }, 20_000)

    // Timeout is 100ms because we await on `recipes/execute` in the previous test
    it('executing a recipe sends chat/updateMessageInProgress notifications', () => streamingChatMessages, 100)

    it('allows us to cancel chat', async () => {
        setTimeout(() => client.notify('$/cancelRequest', { id: client.id - 1 }), 200)
        await client.executeRecipe('chat-question', 'How do I implement sum?')
    }, 500)

    afterAll(async () => {
        await client.shutdownAndExit()
    })
})
