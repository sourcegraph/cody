import assert from 'assert'
import { execSync, spawn } from 'child_process'
import fspromises from 'fs/promises'
import os from 'os'
import path from 'path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Uri } from 'vscode'

import type { ExtensionMessage } from '../../vscode/src/chat/protocol'

import { AgentTextDocument } from './AgentTextDocument'
import { MessageHandler } from './jsonrpc-alias'
import { ClientInfo, ServerInfo } from './protocol-alias'

export class TestClient extends MessageHandler {
    constructor() {
        super()
        this.registerNotification('debug/message', message => {
            console.log(`${message.channel}: ${message.message}`)
        })
    }

    public async handshake(clientInfo: ClientInfo): Promise<ServerInfo> {
        return new Promise((resolve, reject) => {
            setTimeout(
                () =>
                    reject(
                        new Error(
                            "Agent didn't initialize within 10 seconds, something is most likely wrong." +
                                " If you think it's normal for the agent to use more than 10 seconds to initialize," +
                                ' increase this timeout.'
                        )
                    ),
                10_000
            )
            this.request('initialize', clientInfo).then(
                info => {
                    this.notify('initialized', null)
                    resolve(info)
                },
                error => reject(error)
            )
        })
    }

    public async shutdownAndExit() {
        await this.request('shutdown', null)
        this.notify('exit', null)
    }
}

const dotcom = 'https://sourcegraph.com'
const isRecordingEnabled = process.env.CODY_RECORDING_MODE === 'record' || process.env.CODY_RECORD_IF_MISSING === 'true'
if (isRecordingEnabled) {
    console.log('Because CODY_RECORDING_MODE=record, validating that you are authenticated to sourcegraph.com')
    execSync('src login', { stdio: 'inherit' })
    assert.strictEqual(process.env.SRC_ENDPOINT, dotcom, 'SRC_ENDPOINT must be https://sourcegraph.com')
}

const explainPollyError = `

===================================================[ NOTICE ]=======================================================
If you get PollyError or unexpeced diff, you might need to update recordings to match your changes.
Please check https://github.com/sourcegraph/cody/tree/main/agent#updating-the-polly-http-recordings for the details.
====================================================================================================================

`

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

    const prototypePath = path.join(__dirname, '__tests__', 'example-ts')
    const workspaceRootUri = Uri.file(path.join(os.tmpdir(), 'cody-vscode-shim-test'))
    const workspaceRootPath = workspaceRootUri.fsPath

    const cwd = process.cwd()
    const agentDir = path.basename(cwd) === 'agent' ? cwd : path.join(cwd, 'agent')
    const agentScript = path.join(agentDir, 'dist', 'index.js')

    // Bundle the agent. When running `pnpm run test`, vitest doesn't re-run this step.
    execSync('pnpm run build', { cwd: agentDir, stdio: 'inherit' })

    const recordingDirectory = path.join(agentDir, 'recordings')

    function spawnAgentProcess(accessToken?: string) {
        return spawn('node', ['--inspect', '--enable-source-maps', agentScript, 'jsonrpc'], {
            stdio: 'pipe',
            cwd: agentDir,
            env: {
                CODY_SHIM_TESTING: 'true',
                CODY_RECORDING_MODE: 'replay', // can be overwritten with process.env.CODY_RECORDING_MODE
                CODY_RECORDING_DIRECTORY: recordingDirectory,
                CODY_RECORDING_NAME: 'FullConfig',
                SRC_ACCESS_TOKEN: accessToken,
                ...process.env,
            },
        })
    }

    function getClientInfo(accessToken?: string): ClientInfo {
        return {
            name: 'test-client',
            version: 'v1',
            workspaceRootUri: workspaceRootUri.toString(),
            workspaceRootPath,
            extensionConfiguration: {
                anonymousUserID: 'abcde1234',
                accessToken: accessToken ?? 'sgp_RRRRRRRREEEEEEEDDDDDDAAACCCCCTEEEEEEEDDD',
                serverEndpoint: dotcom,
                customHeaders: {},
                autocompleteAdvancedProvider: 'anthropic',
                customConfiguration: {
                    'cody.autocomplete.experimental.graphContext': null,
                },
                debug: false,
                verboseDebug: false,
                codebase: 'github.com/sourcegraph/cody',
            },
        }
    }

    async function sendSingleMessage(client: TestClient, text: string): Promise<any> {
        const id = await client.request('chat/new', null)
        const reply = await client.request('chat/submitMessage', {
            id,
            message: {
                command: 'submit',
                text,
                submitType: 'user',
                addEnhancedContext: true,
                contextFiles: [],
            },
        })
        const lastMessage: any = reply.type === 'transcript' ? reply.messages.at(-1) : reply
        return lastMessage
    }

    function createClient(accessToken?: string): [TestClient, ClientInfo] {
        const agentProcess = spawnAgentProcess(accessToken)
        const client = new TestClient()
        const clientInfo: ClientInfo = getClientInfo(accessToken)

        client.connectProcess(agentProcess, error => {
            console.log({ error })
            process.exit(1)
        })

        const notifications: ExtensionMessage[] = []
        client.registerNotification('webview/postMessage', ({ message }) => {
            notifications.push(message)
        })

        return [client, clientInfo]
    }

    const [client, clientInfo] = createClient(process.env.SRC_ACCESS_TOKEN)
    const [rateLimitedClient, rateLimitedClientInfo] = createClient(process.env.SRC_ACCESS_TOKEN_WITH_RATE_LIMIT)

    // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
    beforeAll(async () => {
        await fspromises.mkdir(workspaceRootPath, { recursive: true })
        await fspromises.cp(prototypePath, workspaceRootPath, { recursive: true })
        try {
            const serverInfo = await client.handshake(clientInfo)
            assert.deepStrictEqual(serverInfo.name, 'cody-agent', 'Agent should be cody-agent')

            const rateLimitedServerInfo = await rateLimitedClient.handshake(rateLimitedClientInfo)
            assert.deepStrictEqual(rateLimitedServerInfo.name, 'cody-agent', 'Agent should be cody-agent')
        } catch (error) {
            if (error === undefined) {
                throw new Error('Agent failed to initialize, error is undefined')
            } else if (error instanceof Error) {
                throw error
            } else {
                throw new TypeError(`Agent failed to initialize, error is ${JSON.stringify(error)}`, { cause: error })
            }
        }
    }, 1000000)

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

    it('lists recipes correctly', async () => {
        const recipes = await client.request('recipes/list', null)
        assert.equal(9, recipes.length, JSON.stringify(recipes))
    })

    const sumPath = path.join(workspaceRootPath, 'src', 'sum.ts')
    const sumUri = Uri.file(sumPath)
    const animalPath = path.join(workspaceRootPath, 'src', 'animal.ts')
    const animalUri = Uri.file(animalPath)

    async function openFile(uri: Uri) {
        let content = await fspromises.readFile(uri.fsPath, 'utf8')
        const selectionStart = content.indexOf('/* SELECTION_START */')
        const selectionEnd = content.indexOf('/* SELECTION_END */')
        const cursor = content.indexOf('/* CURSOR */')

        content = content
            .replace('/* CURSOR */', '')
            .replace('/* SELECTION_START */', '')
            .replace('/* SELECTION_END */', '')

        const document = AgentTextDocument.from(uri, content)
        const start =
            cursor >= 0
                ? document.positionAt(cursor)
                : selectionStart >= 0
                ? document.positionAt(selectionEnd)
                : undefined
        const end = cursor >= 0 ? start : selectionStart >= 0 ? document.positionAt(selectionStart) : undefined
        client.notify('textDocument/didOpen', {
            uri: uri.toString(),
            content,
            selection: start && end ? { start, end } : undefined,
        })
    }

    it('accepts textDocument/didOpen notifications', async () => {
        await openFile(sumUri)
    })

    it('returns non-empty autocomplete', async () => {
        const completions = await client.request('autocomplete/execute', {
            uri: sumUri.toString(),
            position: { line: 1, character: 3 },
            triggerKind: 'Invoke',
        })
        const texts = completions.items.map(item => item.insertText)
        expect(completions.items.length).toBeGreaterThan(0)
        expect(texts).toMatchInlineSnapshot(
            `
          [
            "   return a + b;",
          ]
        `,
            explainPollyError
        )
        client.notify('autocomplete/completionAccepted', { completionID: completions.items[0].id })
    }, 10_000)

    it('allows us to send a very short chat message', async () => {
        await openFile(animalUri)
        const lastMessage: any = await sendSingleMessage(client, 'Hello!')
        expect(lastMessage).toMatchInlineSnapshot(
            `
          {
            "contextFiles": [],
            "displayText": " Hello! I don't have any selected code from /src/animal.ts to use. If you provide me with some selected code snippets from that file, I'd be happy to incorporate them into my responses.",
            "speaker": "assistant",
            "text": " Hello! I don't have any selected code from /src/animal.ts to use. If you provide me with some selected code snippets from that file, I'd be happy to incorporate them into my responses.",
          }
        `,
            explainPollyError
        )
    }, 20_000)

    it('allows us to send a longer chat message', async () => {
        await openFile(animalUri)
        const lastMessage: any = await sendSingleMessage(client, 'Generate simple hello world function in java!')
        expect(lastMessage).toMatchInlineSnapshot(
            `
          {
            "contextFiles": [],
            "displayText": " Here is a simple Hello World function in Java:

          \`\`\`java
          public class Main {

            public static void main(String[] args) {
              System.out.println(\\"Hello World!\\");
            }

          }
          \`\`\`

          This defines a Main class with a main method that prints \\"Hello World!\\" when executed. The main method is the entry point for a Java program.",
            "speaker": "assistant",
            "text": " Here is a simple Hello World function in Java:

          \`\`\`java
          public class Main {

            public static void main(String[] args) {
              System.out.println(\\"Hello World!\\");
            }

          }
          \`\`\`

          This defines a Main class with a main method that prints \\"Hello World!\\" when executed. The main method is the entry point for a Java program.",
          }
        `,
            explainPollyError
        )
    }, 20_000)

    // TODO Improve test - this test currently works only when recording is enabled
    // because Polly does not want to save request which results in error.
    // To run correctly it requires SRC_ACCESS_TOKEN_WITH_RATE_LIMIT env var
    // to be set to access token for account with exhaused rate limit.
    it.skipIf(!isRecordingEnabled)(
        'get rate limit error if exceeding usage on rate limited account',
        async () => {
            await openFile(animalUri)
            const lastMessage: any = await sendSingleMessage(rateLimitedClient, 'sqrt(9)')
            expect(lastMessage.error.name).toMatchInlineSnapshot('"RateLimitError"', explainPollyError)
        },
        20_000
    )

    const isMacOS = process.platform === 'darwin'
    // TODO Fix test - fails intermittently on macOS on Github Actions
    // e.g. https://github.com/sourcegraph/cody/actions/runs/7191096335/job/19585263054#step:9:1723
    it.skipIf(isMacOS)(
        'allows us to cancel chat',
        async () => {
            setTimeout(() => client.notify('$/cancelRequest', { id: client.id - 1 }), 300)
            await client.request('recipes/execute', { id: 'chat-question', humanChatInput: 'How do I implement sum?' })
        },
        600
    )

    afterAll(async () => {
        await fspromises.rm(workspaceRootPath, { recursive: true, force: true })
        await client.shutdownAndExit()
        // Long timeout because to allow Polly.js to persist HTTP recordings
    }, 20_000)
})
