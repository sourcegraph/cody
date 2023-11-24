import assert from 'assert'
import { execSync, spawn } from 'child_process'
import path from 'path'

import { afterAll, beforeAll, describe, it } from 'vitest'

import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'

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

const dotcom = 'https://sourcegraph.com'
const clients: { name: string; clientInfo: ClientInfo }[] = [
    {
        name: 'FullConfig',
        clientInfo: {
            name: 'test-client',
            version: 'v1',
            workspaceRootUri: 'file:///path/to/foo',
            workspaceRootPath: '/path/to/foo',
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
            },
        },
    },
]

describe.each(clients)('describe StandardAgent with $name', ({ name, clientInfo }) => {
    if (process.env.VITEST_ONLY && !process.env.VITEST_ONLY.includes(name)) {
        it(name + ' tests are skipped due to VITEST_ONLY environment variable', () => {})
        return
    }
    const client = new TestClient()

    // Bundle the agent. When running `pnpm run test`, vitest doesn't re-run this step.
    execSync('pnpm run build', { stdio: 'inherit' })
    const recordingDirectory = path.join(__dirname, '..', 'recordings')
    if (process.env.CODY_RECORDING_MODE?.includes('record')) {
        console.log('Recording mode enabled. Validating that you are authenticated to sourcegraph.com')
        execSync('src login', { stdio: 'inherit' })
        assert.strictEqual(
            process.env.SRC_ENDPOINT,
            clientInfo.extensionConfiguration?.serverEndpoint,
            'SRC_ENDPOINT must match clientInfo.extensionConfiguration.serverEndpoint'
        )
    }
    const agentProcess = spawn('node', [path.join(__dirname, '..', 'dist', 'index.js'), 'jsonrpc'], {
        stdio: 'pipe',
        env: {
            CODY_RECORDING_MODE: 'replay', // can be overwritten with process.env.CODY_RECORDING_MODE
            CODY_RECORDING_DIRECTORY: recordingDirectory,
            CODY_RECORDING_NAME: name,
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
            anonymousUserID: 'abcde1234',
            accessToken: '',
            serverEndpoint: 'https://sourcegraph.com/',
            customHeaders: {},
        })
        client.notify('extensionConfiguration/didChange', {
            anonymousUserID: 'abcde1234',
            accessToken: clientInfo.extensionConfiguration?.accessToken ?? 'invalid',
            serverEndpoint: clientInfo.extensionConfiguration?.serverEndpoint ?? dotcom,
            customHeaders: {},
        })
    })

    it('lists recipes correctly', async () => {
        const recipes = await client.listRecipes()
        assert.equal(9, recipes.length)
    })

    it('returns non-empty autocomplete', async () => {
        const filePath = '/path/to/foo/file.ts'
        const content = 'function sum(a: number, b: number) {\n    \n}'
        client.notify('textDocument/didOpen', {
            filePath,
            content,
            selection: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
        })
        const completions = await client.request('autocomplete/execute', {
            filePath,
            position: { line: 1, character: 3 },
            triggerKind: 'Invoke',
        })
        assert(completions.items.length > 0)
    }, 10_000)

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
        setTimeout(() => client.notify('$/cancelRequest', { id: client.id - 1 }), 300)
        await client.executeRecipe('chat-question', 'How do I implement sum?')
    }, 600)

    afterAll(async () => {
        await client.shutdownAndExit()
        // Long timeout because to allow Polly.js to persist HTTP recordings
    }, 20_000)
})
