import assert from 'assert'
import { execSync, spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import fspromises from 'fs/promises'
import os from 'os'
import path from 'path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { Uri } from 'vscode'

import { type ChatMessage, type ContextFile } from '@sourcegraph/cody-shared'

import type { ExtensionMessage } from '../../vscode/src/chat/protocol'

import { AgentTextDocument } from './AgentTextDocument'
import { MessageHandler } from './jsonrpc-alias'
import { type ClientInfo, type ProgressReportParams, type ProgressStartParams, type ServerInfo } from './protocol-alias'

type ProgressMessage = ProgressStartMessage | ProgressReportMessage | ProgressEndMessage
interface ProgressStartMessage {
    method: 'progress/start'
    id: string
    message: ProgressStartParams
}
interface ProgressReportMessage {
    method: 'progress/report'
    id: string
    message: ProgressReportParams
}
interface ProgressEndMessage {
    method: 'progress/end'
    id: string
    message: {}
}

export class TestClient extends MessageHandler {
    public info: ClientInfo
    public agentProcess?: ChildProcessWithoutNullStreams
    // Array of all raw `progress/*` notification. Typed as `any` because
    // start/end/report have different types.
    public progressMessages: ProgressMessage[] = []
    public progressIDs = new Map<string, number>()
    public progressStartEvents = new vscode.EventEmitter<ProgressStartParams>()

    constructor(
        public readonly name: string,
        public readonly accessToken?: string
    ) {
        super()

        this.name = name
        this.info = this.getClientInfo()

        this.registerNotification('progress/start', message => {
            this.progressStartEvents.fire(message)
            message.id = this.progressID(message.id)
            this.progressMessages.push({ method: 'progress/start', id: message.id, message })
        })
        this.registerNotification('progress/report', message => {
            message.id = this.progressID(message.id)
            this.progressMessages.push({ method: 'progress/report', id: message.id, message })
        })
        this.registerNotification('progress/end', ({ id }) => {
            this.progressMessages.push({ method: 'progress/end', id: this.progressID(id), message: {} })
        })
        this.registerNotification('debug/message', message => {
            // Uncomment below to see `logDebug` messages.
            // console.log(`${message.channel}: ${message.message}`)
        })
    }

    private progressID(id: string): string {
        const fromCache = this.progressIDs.get(id)
        if (fromCache !== undefined) {
            return `ID_${fromCache}`
        }
        const freshID = this.progressIDs.size
        this.progressIDs.set(id, freshID)
        return `ID_${freshID}`
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

    public async sendSingleMessage(
        text: string,
        params?: { addEnhancedContext?: boolean; contextFiles?: ContextFile[] }
    ): Promise<ChatMessage | undefined> {
        const id = await this.request('chat/new', null)
        const reply = await this.request('chat/submitMessage', {
            id,
            message: {
                command: 'submit',
                text,
                submitType: 'user',
                addEnhancedContext: params?.addEnhancedContext ?? false,
                contextFiles: params?.contextFiles,
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

        return spawn('node', ['--enable-source-maps', agentScript, 'jsonrpc'], {
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
            capabilities: {
                progressBars: 'enabled',
            },
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

const explainPollyError = `

    ===================================================[ NOTICE ]=======================================================
    If you get PollyError or unexpected diff, you might need to update recordings to match your changes.
    Run the following commands locally to update the recordings:

      export SRC_ACCESS_TOKEN=YOUR_TOKEN
      export SRC_ACCESS_TOKEN_WITH_RATE_LIMIT=RATE_LIMITED_TOKEN # see https://sourcegraph.slack.com/archives/C059N5FRYG3/p1702990080820699
      export SRC_ENDPOINT=https://sourcegraph.com
      pnpm update-agent-recordings
      # Press 'u' to update the snapshots if the new behavior makes sense. It's
      # normal that the LLM returns minor changes to the wording.
      git commit -am "Update agent recordings"


    More details in https://github.com/sourcegraph/cody/tree/main/agent#updating-the-polly-http-recordings
    ====================================================================================================================

    `

const prototypePath = path.join(__dirname, '__tests__', 'example-ts')
const workspaceRootUri = Uri.file(path.join(os.tmpdir(), 'cody-vscode-shim-test'))
const workspaceRootPath = workspaceRootUri.fsPath

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
        execSync('src login', { stdio: 'inherit' })
        assert.strictEqual(process.env.SRC_ENDPOINT, dotcom, 'SRC_ENDPOINT must be https://sourcegraph.com')
    }

    if (process.env.VITEST_ONLY && !process.env.VITEST_ONLY.includes('Agent')) {
        it('Agent tests are skipped due to VITEST_ONLY environment variable', () => {})
        return
    }

    const client = new TestClient('defaultClient', process.env.SRC_ACCESS_TOKEN)

    // Bundle the agent. When running `pnpm run test`, vitest doesn't re-run this step.
    //
    // ⚠️ If this line fails when running unit tests, chances are that the error is being swallowed.
    // To see the full error, run this file in isolation:
    //
    //   pnpm test agent/src/index.test.ts
    execSync('pnpm run build:agent', { cwd: client.getAgentDir(), stdio: 'inherit' })

    // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
    beforeAll(async () => {
        await fspromises.mkdir(workspaceRootPath, { recursive: true })
        await fspromises.cp(prototypePath, workspaceRootPath, { recursive: true })
        await client.initialize()
    }, 10_000)

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
        const lastMessage = await client.sendSingleMessage('Hello!')
        expect(lastMessage).toMatchInlineSnapshot(
            `
          {
            "contextFiles": [],
            "displayText": " Hello there!",
            "speaker": "assistant",
            "text": " Hello there!",
          }
        `,
            explainPollyError
        )
    }, 20_000)

    it('allows us to send a longer chat message', async () => {
        const lastMessage = await client.sendSingleMessage('Generate simple hello world function in java!')
        const trimmedMessage = trimEndOfLine(lastMessage?.text ?? '')
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

          - The code is wrapped in a class called Main. In Java, code must be contained within classes.

          - The main method is the entry point of the program. It is marked as static so it can be run without creating an instance of Main.

          - The main method accepts a String array called args as a parameter. This contains any command line arguments passed to the program.

          - System.out.println prints the text \\"Hello World!\\" to the console.

          To run this:

          1. Save the code in a file called Main.java
          2. Compile it with: javac Main.java
          3. Run it with: java Main

          This will print \\"Hello World!\\" to the console when executed."
        `,
            explainPollyError
        )
    }, 20_000)

    // This test is skipped because it shells out to `symf expand-query`, which
    // requires an access token to send an llm request and is, therefore, not
    // able to return stable results in replay mode. Also, we don't have an
    // access token in ci so this test can only pass when running locally (for
    // now).
    it('allows us to send a chat message with enhanced context enabled', async () => {
        await openFile(animalUri)
        await client.request('command/execute', { command: 'cody.search.index-update' })
        const lastMessage = await client.sendSingleMessage(
            'Write a class Dog that implements the Animal interface in my workspace. Only show the code, no explanation needed.',
            {
                addEnhancedContext: true,
            }
        )
        // TODO: make this test return a TypeScript implementation of
        // `animal.ts`. It currently doesn't do this because the workspace root
        // is not a git directory and symf reports some git-related error.
        expect(trimEndOfLine(lastMessage?.text ?? '')).toMatchInlineSnapshot(
            `
          " Here is the code for the Dog class implementing the Animal interface:

          \`\`\`java
          public class Dog implements Animal {

            @Override
            public void makeSound() {
              System.out.println(\\"Woof!\\");
            }

            @Override
            public void move() {
              System.out.println(\\"The dog runs.\\");
            }

          }
          \`\`\`"
        `,
            explainPollyError
        )
    }, 20_000)

    // TODO Fix test - fails intermittently on CI
    // e.g. https://github.com/sourcegraph/cody/actions/runs/7191096335/job/19585263054#step:9:1723
    it.skip('allows us to cancel chat', async () => {
        setTimeout(() => client.notify('$/cancelRequest', { id: client.id - 1 }), 300)
        await client.request('recipes/execute', { id: 'chat-question', humanChatInput: 'How do I implement sum?' })
    }, 600)

    describe('progress bars', () => {
        it('messages are sent', async () => {
            const { result } = await client.request('testing/progress', { title: 'Susan' })
            expect(result).toStrictEqual('Hello Susan')
            let progressID: string | undefined
            for (const message of client.progressMessages) {
                if (message.method === 'progress/start' && message.message.options.title === 'testing/progress') {
                    progressID = message.message.id
                    break
                }
            }
            assert(progressID !== undefined, JSON.stringify(client.progressMessages))
            const messages = client.progressMessages
                .filter(message => message.id === progressID)
                .map(({ method, message }) => [method, { ...message, id: 'THE_ID' }])
            expect(messages).toMatchInlineSnapshot(`
              [
                [
                  "progress/start",
                  {
                    "id": "THE_ID",
                    "options": {
                      "cancellable": true,
                      "location": "Notification",
                      "title": "testing/progress",
                    },
                  },
                ],
                [
                  "progress/report",
                  {
                    "id": "THE_ID",
                    "message": "message1",
                  },
                ],
                [
                  "progress/report",
                  {
                    "id": "THE_ID",
                    "increment": 50,
                  },
                ],
                [
                  "progress/report",
                  {
                    "id": "THE_ID",
                    "increment": 50,
                  },
                ],
                [
                  "progress/end",
                  {
                    "id": "THE_ID",
                  },
                ],
              ]
            `)
        })
        it('progress can be cancelled', async () => {
            const disposable = client.progressStartEvents.event(params => {
                if (params.options.title === 'testing/progressCancelation') {
                    client.notify('progress/cancel', { id: params.id })
                }
            })
            try {
                const { result } = await client.request('testing/progressCancelation', { title: 'Leona' })
                expect(result).toStrictEqual("request with title 'Leona' cancelled")
            } finally {
                disposable.dispose()
            }
        })
    })

    describe('RateLimitedAgent', () => {
        const rateLimitedClient = new TestClient('rateLimitedClient', process.env.SRC_ACCESS_TOKEN_WITH_RATE_LIMIT)
        // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
        beforeAll(async () => {
            await rateLimitedClient.initialize()
        }, 10_000)

        it('get rate limit error if exceeding usage on rate limited account', async () => {
            const lastMessage = await rateLimitedClient.sendSingleMessage('sqrt(9)')
            expect(lastMessage?.error?.name).toMatchInlineSnapshot('"RateLimitError"', explainPollyError)
        }, 20_000)

        afterAll(async () => {
            await rateLimitedClient.shutdownAndExit()
            // Long timeout because to allow Polly.js to persist HTTP recordings
        }, 20_000)
    })

    afterAll(async () => {
        await fspromises.rm(workspaceRootPath, { recursive: true, force: true })
        await client.shutdownAndExit()
        // Long timeout because to allow Polly.js to persist HTTP recordings
    }, 20_000)
})

function trimEndOfLine(text: string): string {
    return text
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
}
