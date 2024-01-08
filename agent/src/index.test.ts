import assert from 'assert'
import { ChildProcessWithoutNullStreams, execSync, spawn } from 'child_process'
import fspromises from 'fs/promises'
import os from 'os'
import path from 'path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Uri } from 'vscode'

import { ChatMessage } from '@sourcegraph/cody-shared'

import type { ExtensionMessage } from '../../vscode/src/chat/protocol'

import { AgentTextDocument } from './AgentTextDocument'
import { MessageHandler } from './jsonrpc-alias'
import { ClientInfo, ServerInfo } from './protocol-alias'

export class TestClient extends MessageHandler {
    public info: ClientInfo
    public agentProcess?: ChildProcessWithoutNullStreams

    constructor(
        public readonly name: string,
        public readonly accessToken?: string
    ) {
        super()

        this.name = name
        this.info = this.getClientInfo()

        this.registerNotification('debug/message', message => {
            // Uncomment below to see `logDebug` messages.
            // console.log(`${message.channel}: ${message.message}`)
        })
    }

    public async initialize() {
        this.agentProcess = this.spawnAgentProcess()

        this.connectProcess(this.agentProcess, error => {
            console.error(error)
        })

        const notifications: ExtensionMessage[] = []
        this.registerNotification('webview/postMessage', ({ message }) => {
            notifications.push(message)
        })

        try {
            const serverInfo = await this.handshake(this.info)
            assert.deepStrictEqual(serverInfo.name, 'cody-agent', 'Agent should be cody-agent')
        } catch (error) {
            if (error === undefined) {
                throw new Error('Agent failed to initialize, error is undefined')
            } else if (error instanceof Error) {
                throw error
            } else {
                throw new TypeError(`Agent failed to initialize, error is ${JSON.stringify(error)}`, { cause: error })
            }
        }
    }

    public async sendSingleMessage(text: string): Promise<ChatMessage | undefined> {
        const id = await this.request('chat/new', null)
        const reply = await this.request('chat/submitMessage', {
            id,
            message: {
                command: 'submit',
                text,
                submitType: 'user',
                addEnhancedContext: false,
                contextFiles: [],
            },
        })

        if (reply.type !== 'transcript') {
            throw new Error(`Unexpected reply: ${JSON.stringify(reply)}`)
        }

        return reply.messages.at(-1)
    }

    public async shutdownAndExit() {
        if (this.isAlive()) {
            await this.request('shutdown', null)
            this.notify('exit', null)
        } else {
            console.log('Agent has already exited')
        }
    }

    public getAgentDir(): string {
        const cwd = process.cwd()
        return path.basename(cwd) === 'agent' ? cwd : path.join(cwd, 'agent')
    }

    private async handshake(clientInfo: ClientInfo): Promise<ServerInfo> {
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

    private spawnAgentProcess() {
        const agentDir = this.getAgentDir()
        const recordingDirectory = path.join(agentDir, 'recordings')
        const agentScript = path.join(agentDir, 'dist', 'index.js')

        return spawn('node', ['--inspect', '--enable-source-maps', agentScript, 'jsonrpc'], {
            stdio: 'pipe',
            cwd: agentDir,
            env: {
                CODY_SHIM_TESTING: 'true',
                CODY_LOCAL_EMBEDDINGS_DISABLED: 'true',
                CODY_RECORDING_MODE: 'replay', // can be overwritten with process.env.CODY_RECORDING_MODE
                CODY_RECORDING_DIRECTORY: recordingDirectory,
                CODY_RECORDING_NAME: this.name,
                SRC_ACCESS_TOKEN: this.accessToken,
                ...process.env,
            },
        })
    }

    private getClientInfo(): ClientInfo {
        const workspaceRootUri = Uri.file(path.join(os.tmpdir(), 'cody-vscode-shim-test'))

        return {
            name: this.name,
            version: 'v1',
            workspaceRootUri: workspaceRootUri.toString(),
            workspaceRootPath: workspaceRootUri.fsPath,
            extensionConfiguration: {
                anonymousUserID: this.name + 'abcde1234',
                accessToken: this.accessToken ?? 'sgp_RRRRRRRREEEEEEEDDDDDDAAACCCCCTEEEEEEEDDD',
                serverEndpoint: 'https://sourcegraph.com',
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
}

describe('Agent', () => {
    // Uncomment the code block below to disable agent tests. Feel free to do this to unblock
    // merging a PR if the agent tests are failing. If you decide to uncomment this block, please
    // post in #wg-cody-agent to let the team know the tests have been disabled so that we can
    // investigate the problem and get the passing again.
    // if (process.env.SRC_ACCESS_TOKEN === undefined || process.env.SRC_ENDPOINT === undefined) {
    //     it('no-op test because SRC_ACCESS_TOKEN is not set. To actually run the Cody Agent tests, set the environment variables SRC_ENDPOINT and SRC_ACCESS_TOKEN', () => {})
    //     return
    // }

    const dotcom = 'https://sourcegraph.com'
    if (process.env.CODY_RECORDING_MODE === 'record' || process.env.CODY_RECORD_IF_MISSING === 'true') {
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

    if (process.env.VITEST_ONLY && !process.env.VITEST_ONLY.includes('Agent')) {
        it('Agent tests are skipped due to VITEST_ONLY environment variable', () => {})
        return
    }

    const prototypePath = path.join(__dirname, '__tests__', 'example-ts')
    const workspaceRootUri = Uri.file(path.join(os.tmpdir(), 'cody-vscode-shim-test'))
    const workspaceRootPath = workspaceRootUri.fsPath

    const client = new TestClient('defaultClient', process.env.SRC_ACCESS_TOKEN)
    const rateLimitedClient = new TestClient('rateLimitedClient', process.env.SRC_ACCESS_TOKEN_WITH_RATE_LIMIT)

    // Bundle the agent. When running `pnpm run test`, vitest doesn't re-run this step.
    execSync('pnpm run build', { cwd: client.getAgentDir(), stdio: 'inherit' })

    // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
    beforeAll(async () => {
        await fspromises.mkdir(workspaceRootPath, { recursive: true })
        await fspromises.cp(prototypePath, workspaceRootPath, { recursive: true })
        await client.initialize()
        await rateLimitedClient.initialize()
    }, 1000000)

    it('handles config changes correctly', () => {
        // Send two config change notifications because this is what the
        // JetBrains client does and there was a bug where everything worked
        // fine as long as we didn't send the second unauthenticated config
        // change.
        client.notify('extensionConfiguration/didChange', {
            ...client.info.extensionConfiguration,
            anonymousUserID: 'abcde1234',
            accessToken: '',
            serverEndpoint: 'https://sourcegraph.com/',
            customHeaders: {},
        })
        client.notify('extensionConfiguration/didChange', {
            ...client.info.extensionConfiguration,
            anonymousUserID: 'abcde1234',
            accessToken: client.info.extensionConfiguration?.accessToken ?? 'invalid',
            serverEndpoint: client.info.extensionConfiguration?.serverEndpoint ?? dotcom,
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
        const lastMessage = await client.sendSingleMessage('Hello!')
        expect(lastMessage).toMatchInlineSnapshot(
            `
          {
            "contextFiles": [],
            "displayText": " Hello! Nice to meet you.",
            "speaker": "assistant",
            "text": " Hello! Nice to meet you.",
          }
        `,
            explainPollyError
        )
    }, 20_000)

    it('allows us to send a longer chat message', async () => {
        await openFile(animalUri)
        const lastMessage = await client.sendSingleMessage('Generate simple hello world function in java!')
        const trimmedMessage = lastMessage?.text
            ?.split('\n')
            .map(line => line.trimEnd())
            .join('\n')
        expect(trimmedMessage).toMatchInlineSnapshot(
            `
          " Here is a simple Hello World program in Java:

          \`\`\`java
          public class Main {
            public static void main(String[] args) {
              System.out.println(\\"Hello World!\\");
            }
          }
          \`\`\`

          To break this down:

          - The code is wrapped in a class called Main. In Java, code must be inside a class.

          - The main method is the entry point of the program. It is marked as static so it can be run without creating an instance of Main.

          - The main method accepts a String array called args as a parameter. This contains any command line arguments passed to the program.

          - Inside the main method, we call System.out.println(\\"Hello World\\"); to print the text \\"Hello World!\\" to the console.

          - The println method prints the text and a newline character.

          So in summary, this program defines a Main class with a static main method that prints \\"Hello World!\\" when executed. This is the simplest Hello World program in Java."
        `,
            explainPollyError
        )
    }, 20_000)

    it('get rate limit error if exceeding usage on rate limited account', async () => {
        const lastMessage = await rateLimitedClient.sendSingleMessage('sqrt(9)')
        expect(lastMessage?.error?.name).toMatchInlineSnapshot('"RateLimitError"', explainPollyError)
    }, 20_000)

    // TODO Fix test - fails intermittently on CI
    // e.g. https://github.com/sourcegraph/cody/actions/runs/7191096335/job/19585263054#step:9:1723
    it.skip('allows us to cancel chat', async () => {
        setTimeout(() => client.notify('$/cancelRequest', { id: client.id - 1 }), 300)
        await client.request('recipes/execute', { id: 'chat-question', humanChatInput: 'How do I implement sum?' })
    }, 600)

    afterAll(async () => {
        await fspromises.rm(workspaceRootPath, { recursive: true, force: true })
        await client.shutdownAndExit()
        await rateLimitedClient.shutdownAndExit()
        // Long timeout because to allow Polly.js to persist HTTP recordings
    }, 20_000)
})
