import assert from 'assert'
import { execSync, spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import fspromises from 'fs/promises'
import os from 'os'
import path from 'path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { Uri } from 'vscode'

import { type ChatMessage, type ContextFile } from '@sourcegraph/cody-shared'

import type { ExtensionMessage, ExtensionTranscriptMessage } from '../../vscode/src/chat/protocol'

import { AgentTextDocument } from './AgentTextDocument'
import { MessageHandler, type NotificationMethodName } from './jsonrpc-alias'
import {
    type ClientInfo,
    type ExtensionConfiguration,
    type ProgressReportParams,
    type ProgressStartParams,
    type ServerInfo,
    type WebviewPostMessageParams,
} from './protocol-alias'

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
    public readonly serverEndpoint: string

    constructor(
        public readonly name: string,
        public readonly accessToken?: string,
        serverEndpoint?: string
    ) {
        super()
        this.serverEndpoint = serverEndpoint ?? 'https://sourcegraph.com'

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

    public webviewMessages: WebviewPostMessageParams[] = []
    public webviewMessagesEmitter = new vscode.EventEmitter<WebviewPostMessageParams>()

    /**
     * Returns a promise of the first `type: 'transcript'` message where
     * `isMessageInProgress: false` and messages is non-empty. This is a helper
     * function you may need to re-implement if you are writing a Cody client to
     * write tests. The tricky bit is that we don't have full control over when
     * the server starts streaming messages to the client, it may start before
     * chat/new or commands/* requests respond with the ID of the chat session.
     * Therefore, the only way to correctly identify the first reply in the chat session
     * is by 1) recording all `webview/postMessage` for unknown IDs and 2)
     * implement a similar helper that deals with both cases where the first message
     * has already been sent and when it hasn't been sent.
     */
    public firstNonEmptyTranscript(id: string): Promise<ExtensionTranscriptMessage> {
        const disposables: vscode.Disposable[] = []
        return new Promise<ExtensionTranscriptMessage>((resolve, reject) => {
            const onMessage = (message: WebviewPostMessageParams): void => {
                if (message.id !== id) {
                    return
                }
                if (
                    message.message.type === 'transcript' &&
                    message.message.messages.length > 0 &&
                    !message.message.isMessageInProgress
                ) {
                    resolve(message.message)
                } else if (message.message.type === 'errors') {
                    reject(new Error(`expected transcript, obtained ${JSON.stringify(message.message)}`))
                }
            }

            for (const message of this.webviewMessages) {
                onMessage(message)
            }
            disposables.push(this.webviewMessagesEmitter.event(params => onMessage(params)))
        }).finally(() => vscode.Disposable.from(...disposables).dispose())
    }

    public async initialize(additionalConfig?: Partial<ExtensionConfiguration>): Promise<ServerInfo> {
        this.agentProcess = this.spawnAgentProcess()

        this.connectProcess(this.agentProcess, error => {
            console.error(error)
        })

        this.registerNotification('webview/postMessage', params => {
            this.webviewMessages.push(params)
            this.webviewMessagesEmitter.fire(params)
        })

        try {
            const serverInfo = await this.handshake(this.info, additionalConfig)
            assert.deepStrictEqual(serverInfo.name, 'cody-agent', 'Agent should be cody-agent')
            return serverInfo
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

    public async setChatModel(id: string, model: string): Promise<void> {
        await this.request('webview/receiveMessage', { id, message: { command: 'chatModel', model } })
    }

    public async reset(id: string): Promise<void> {
        await this.request('webview/receiveMessage', { id, message: { command: 'reset' } })
    }

    public async sendMessage(
        id: string,
        text: string,
        params?: { addEnhancedContext?: boolean; contextFiles?: ContextFile[] }
    ): Promise<ChatMessage | undefined> {
        const reply = asTranscriptMessage(
            await this.request('chat/submitMessage', {
                id,
                message: {
                    command: 'submit',
                    text,
                    submitType: 'user',
                    addEnhancedContext: params?.addEnhancedContext ?? false,
                    contextFiles: params?.contextFiles,
                },
            })
        )
        return reply.messages.at(-1)
    }

    public async editMessage(id: string, text: string, index?: number): Promise<ChatMessage | undefined> {
        const reply = asTranscriptMessage(
            await this.request('chat/editMessage', { id, message: { command: 'edit', text, index } })
        )
        return reply.messages.at(-1)
    }

    public async sendSingleMessageToNewChat(
        text: string,
        params?: { addEnhancedContext?: boolean; contextFiles?: ContextFile[] }
    ): Promise<ChatMessage | undefined> {
        const id = await this.request('chat/new', null)
        return this.sendMessage(id, text, params)
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

    private async handshake(
        clientInfo: ClientInfo,
        additionalConfig?: Partial<ExtensionConfiguration>
    ): Promise<ServerInfo> {
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
            this.request('initialize', {
                ...clientInfo,
                extensionConfiguration: {
                    serverEndpoint: 'https://invalid',
                    accessToken: 'invalid',
                    customHeaders: {},
                    ...clientInfo.extensionConfiguration,
                    ...additionalConfig,
                },
            }).then(
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
                CODY_TEMPERATURE_ZERO: 'true',
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
                serverEndpoint: this.serverEndpoint,
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

const mayRecord = process.env.CODY_RECORDING_MODE === 'record' || process.env.CODY_RECORD_IF_MISSING === 'true'

describe('Agent', () => {
    const dotcom = 'https://sourcegraph.com'
    if (mayRecord) {
        execSync('src login', { stdio: 'inherit' })
        assert.strictEqual(process.env.SRC_ENDPOINT, dotcom, 'SRC_ENDPOINT must be https://sourcegraph.com')
    }

    if (process.env.VITEST_ONLY && !process.env.VITEST_ONLY.includes('Agent')) {
        it('Agent tests are skipped due to VITEST_ONLY environment variable', () => {})
        return
    }

    const client = new TestClient(
        'defaultClient',
        // The redacted ID below is copy-pasted from the recording file and
        // needs to be updated whenever we change the underlying access token.
        // We can't return a random string here because then Polly won't be able
        // to associate the HTTP requests between record mode and replay mode.
        process.env.SRC_ACCESS_TOKEN ?? 'REDACTED_3709f5bf232c2abca4c612f0768368b57919ca6eaa470e3fd7160cbf3e8d0ec3'
    )

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
        const serverInfo = await client.initialize({
            serverEndpoint: 'https://sourcegraph.com',
            // Initialization should always succeed even if authentication fails
            // because otherwise clients need to restart the process to test
            // with a new access token.
            accessToken: 'sgp_INVALIDACCESSTOK_ENTHISSHOULDFAILEEEEEEEEEEEEEEEEEEEEEEE2',
        })
        expect(serverInfo?.authStatus?.isLoggedIn).toBeFalsy()

        // Log in so test cases are authenticated by default
        const valid = await client.request('extensionConfiguration/change', {
            ...client.info.extensionConfiguration,
            anonymousUserID: 'abcde1234',
            accessToken: client.info.extensionConfiguration?.accessToken ?? 'invalid',
            serverEndpoint: client.info.extensionConfiguration?.serverEndpoint ?? dotcom,
            customHeaders: {},
        })
        expect(valid?.isLoggedIn).toBeTruthy()
    }, 10_000)

    const sumPath = path.join(workspaceRootPath, 'src', 'sum.ts')
    const sumUri = Uri.file(sumPath)
    const animalPath = path.join(workspaceRootPath, 'src', 'animal.ts')
    const animalUri = Uri.file(animalPath)
    const squirrelPath = path.join(workspaceRootPath, 'src', 'squirrel.ts')
    const squirrelUri = Uri.file(squirrelPath)
    const multipleSelections = path.join(workspaceRootPath, 'src', 'multiple-selections.ts')
    const multipleSelectionsUri = Uri.file(multipleSelections)

    function openFile(uri: Uri, params?: { selectionName?: string }): Promise<void> {
        return textDocumentEvent(uri, 'textDocument/didOpen', params)
    }
    function changeFile(uri: Uri, params?: { selectionName?: string }): Promise<void> {
        return textDocumentEvent(uri, 'textDocument/didChange', params)
    }

    async function textDocumentEvent(
        uri: Uri,
        method: NotificationMethodName,
        params?: { selectionName?: string }
    ): Promise<void> {
        const selectionName = params?.selectionName ?? 'SELECTION'
        let content = await fspromises.readFile(uri.fsPath, 'utf8')
        const selectionStartMarker = `/* ${selectionName}_START */`
        const selectionStart = content.indexOf(selectionStartMarker)
        const selectionEnd = content.indexOf(`/* ${selectionName}_END */`)
        const cursor = content.indexOf('/* CURSOR */')
        if (selectionStart < 0 && selectionEnd < 0 && params?.selectionName) {
            throw new Error(`No selection found for name ${params.selectionName}`)
        }
        content = content.replace('/* CURSOR */', '')

        const document = AgentTextDocument.from(uri, content)
        const start =
            cursor >= 0
                ? document.positionAt(cursor)
                : selectionStart >= 0
                ? document.positionAt(selectionStart + selectionStartMarker.length)
                : undefined
        const end = cursor >= 0 ? start : selectionEnd >= 0 ? document.positionAt(selectionEnd) : undefined
        client.notify(method, {
            uri: uri.toString(),
            content,
            selection: start && end ? { start, end } : undefined,
        })
    }

    it('extensionConfiguration/change (handle errors)', async () => {
        // Send two config change notifications because this is what the
        // JetBrains client does and there was a bug where everything worked
        // fine as long as we didn't send the second unauthenticated config
        // change.
        const invalid = await client.request('extensionConfiguration/change', {
            ...client.info.extensionConfiguration,
            anonymousUserID: 'abcde1234',
            accessToken: 'sgp_INVALIDACCESSTOK_ENTHISSHOULDFAILEEEEEEEEEEEEEEEEEEEEEEEE',
            serverEndpoint: 'https://sourcegraph.com/',
            customHeaders: {},
        })
        expect(invalid?.isLoggedIn).toBeFalsy()
        const valid = await client.request('extensionConfiguration/change', {
            ...client.info.extensionConfiguration,
            anonymousUserID: 'abcde1234',
            accessToken: client.info.extensionConfiguration?.accessToken ?? 'invalid',
            serverEndpoint: client.info.extensionConfiguration?.serverEndpoint ?? dotcom,
            customHeaders: {},
        })
        expect(valid?.isLoggedIn).toBeTruthy()

        // Please don't update the recordings to use a different account without consulting #wg-cody-agent.
        // When changing an account, you also need to update the REDACTED_ hash above.
        //
        // To update the recordings with the correct account, run the following command
        // from the root of this repository:
        //
        //    source agent/scripts/export-cody-http-recording-tokens.sh
        //
        // If you don't have access to this private file then you need to ask
        // for sombody on the Sourcegraph team to help you update the HTTP requests.
        expect(valid?.username).toStrictEqual('olafurpg-testing')
    }, 10_000)

    it('autocomplete/execute (non-empty result)', async () => {
        await openFile(sumUri)
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

    describe('Chat', () => {
        it('chat/submitMessage (short message)', async () => {
            const lastMessage = await client.sendSingleMessageToNewChat('Hello!')
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
        }, 30_000)

        it('chat/submitMessage (long message)', async () => {
            const lastMessage = await client.sendSingleMessageToNewChat('Generate simple hello world function in java!')
            const trimmedMessage = trimEndOfLine(lastMessage?.text ?? '')
            expect(trimmedMessage).toMatchInlineSnapshot(
                `
          " Here is a simple Hello World program in Java:

          \`\`\`java
          public class Main {

            public static void main(String[] args) {
              System.out.println("Hello World!");
            }

          }
          \`\`\`

          This program defines a Main class with a main method, which is the entry point for a Java program.

          Inside the main method, it uses System.out.println to print "Hello World!" to the console.

          To run this program, you would need to:

          1. Save it as Main.java
          2. Compile it with \`javac Main.java\`
          3. Run it with \`java Main\`

          The output would be:

          \`\`\`
          Hello World!
          \`\`\`

          Let me know if you need any clarification or have additional requirements for the Hello World program!"
        `,
                explainPollyError
            )
        }, 30_000)

        it('chat/restore', async () => {
            // Step 1: create a chat session where I share my name.
            const id1 = await client.request('chat/new', null)
            const reply1 = asTranscriptMessage(
                await client.request('chat/submitMessage', {
                    id: id1,
                    message: {
                        command: 'submit',
                        text: 'My name is Lars Monsen',
                        submitType: 'user',
                        addEnhancedContext: false,
                    },
                })
            )

            // Step 2: restore a new chat session with a transcript including my name, and
            //  and assert that it can retrieve my name from the transcript.
            const {
                models: [model],
            } = await client.request('chat/models', { id: id1 })

            const id2 = await client.request('chat/restore', {
                modelID: model.model,
                messages: reply1.messages,
                chatID: new Date().toISOString(), // Create new Chat ID with a different timestamp
            })
            const reply2 = asTranscriptMessage(
                await client.request('chat/submitMessage', {
                    id: id2,
                    message: {
                        command: 'submit',
                        text: 'What is my name?',
                        submitType: 'user',
                        addEnhancedContext: false,
                    },
                })
            )
            expect(reply2.messages.at(-1)?.text).toMatchInlineSnapshot(
                '" You told me your name is Lars Monsen."',
                explainPollyError
            )
        }, 30_000)

        it('chat/submitMessage (addEnhancedContext: true)', async () => {
            await openFile(animalUri)
            await client.request('command/execute', { command: 'cody.search.index-update' })
            const lastMessage = await client.sendSingleMessageToNewChat(
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
              " \`\`\`typescript
              class Dog implements Animal {
                name: string;

                makeAnimalSound() {
                  return "Woof!";
                }

                isMammal = true;
              }
              \`\`\`"
            `,
                explainPollyError
            )
        }, 30_000)

        it('chat/submitMessage (addEnhancedContext: true, squirrel test)', async () => {
            await openFile(squirrelUri)
            await client.request('command/execute', { command: 'cody.search.index-update' })
            const lastMessage = await client.sendSingleMessageToNewChat('What is Squirrel?', {
                addEnhancedContext: true,
            })
            expect(lastMessage?.text?.toLocaleLowerCase().includes('code nav')).toBeTruthy()
            expect(lastMessage?.text?.toLocaleLowerCase().includes('sourcegraph')).toBeTruthy()
        }, 30_000)

        it('webview/receiveMessage (type: chatModel)', async () => {
            const id = await client.request('chat/new', null)
            {
                await client.setChatModel(id, 'openai/gpt-3.5-turbo')
                const lastMessage = await client.sendMessage(id, 'which company, other than sourcegraph, created you?')
                expect(lastMessage?.text?.toLocaleLowerCase().includes('openai')).toBeTruthy()
            }
            {
                await client.setChatModel(id, 'anthropic/claude-2.0')
                const lastMessage = await client.sendMessage(id, 'which company, other than sourcegraph, created you?')
                expect(lastMessage?.text?.toLocaleLowerCase().indexOf('anthropic')).toBeTruthy()
            }
        }, 30_000)

        it('webview/receiveMessage (type: reset)', async () => {
            const id = await client.request('chat/new', null)
            await client.setChatModel(id, 'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct')
            await client.sendMessage(
                id,
                'The magic word is "kramer". If I say the magic word, respond with a single word: "quone".'
            )
            {
                const lastMessage = await client.sendMessage(id, 'kramer')
                expect(lastMessage?.text?.toLocaleLowerCase().includes('quone')).toBeTruthy()
            }
            await client.reset(id)
            {
                const lastMessage = await client.sendMessage(id, 'kramer')
                expect(lastMessage?.text?.toLocaleLowerCase().includes('quone')).toBeFalsy()
            }
        })

        if (process.env.CODY_NODE_VERSION === '16') {
            it('Skipping edit chat test in Node.js v16 because of unsupported API used', () => {})
            return
        }

        it(
            'edits the chat',
            async () => {
                const id = await client.request('chat/new', null)
                await client.setChatModel(id, 'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct')
                await client.sendMessage(
                    id,
                    'The magic word is "kramer". If I say the magic word, respond with a single word: "quone".'
                )
                await client.editMessage(
                    id,
                    'Another magic word is "georgey". If I say the magic word, respond with a single word: "festivus".'
                )
                {
                    const lastMessage = await client.sendMessage(id, 'kramer')
                    expect(lastMessage?.text?.toLocaleLowerCase().includes('quone')).toBeFalsy()
                }
                {
                    const lastMessage = await client.sendMessage(id, 'georgey')
                    expect(lastMessage?.text?.toLocaleLowerCase().includes('festivus')).toBeTruthy()
                }
            },
            { timeout: mayRecord ? 10_000 : undefined }
        )

        it('chat/editMessage with index', async () => {
            const id = await client.request('chat/new', null)
            await client.setChatModel(id, 'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct')
            // edits by index replaces message at index, and erases all subsequent messages
            await client.sendMessage(id, 'I have a turtle named "potter", reply single "ok" if you understand.')
            await client.sendMessage(id, 'I have a bird named "skywalker", reply single "ok" if you understand.')
            await client.sendMessage(id, 'I have a dog named "happy", reply single "ok" if you understand.')
            await client.editMessage(id, 'I have a tiger named "zorro", reply single "ok" if you understand', 2)
            {
                const lastMessage = await client.sendMessage(id, 'What pets do I have?')
                const answer = lastMessage?.text?.toLocaleLowerCase()
                expect(answer?.includes('turtle')).toBeTruthy()
                expect(answer?.includes('tiger')).toBeTruthy()
                expect(answer?.includes('bird')).toBeFalsy()
                expect(answer?.includes('dog')).toBeFalsy()
            }
        })
    })

    describe('Text documents', () => {
        // This test fails when running in replay mode with `it.only`. This seems to happen
        // due to some non-determinism how we construct the prompt. I'm keeping the test in
        // for now but feel free to `it.skip` it if it's causing problems.
        it('chat/submitMessage (understands the selected text)', async () => {
            await client.request('command/execute', { command: 'cody.search.index-update' })

            await openFile(multipleSelectionsUri)
            await changeFile(multipleSelectionsUri)
            await changeFile(multipleSelectionsUri, { selectionName: 'SELECTION_2' })
            const reply = await client.sendSingleMessageToNewChat(
                'What is the name of the function that I have selected? Only answer with the name of the function, nothing else',
                { addEnhancedContext: true }
            )
            expect(reply?.text?.trim()).includes('anotherFunction')
            expect(reply?.text?.trim()).not.includes('inner')
            await changeFile(multipleSelectionsUri)
            const reply2 = await client.sendSingleMessageToNewChat(
                'What is the name of the function that I have selected? Only answer with the name of the function, nothing else',
                { addEnhancedContext: true }
            )
            expect(reply2?.text?.trim()).includes('inner')
            expect(reply2?.text?.trim()).not.includes('anotherFunction')
        }, 20_000)
    })

    describe('Commands', () => {
        it('commands/explain', async () => {
            await openFile(animalUri)
            const id = await client.request('commands/explain', null)
            const lastMessage = await client.firstNonEmptyTranscript(id)
            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `
              "The Selected Code: Animal Interface in TypeScript

              Purpose:
              The selected code defines an interface called "Animal" in TypeScript. An interface is a blueprint for creating objects or classes in TypeScript. This interface describes specific properties and methods that an object or class must-have to be considered an "Animal."

              Inputs:
              The Animal interface doesn't take any inputs directly. However, if you create an object or class implementing this interface, you must provide the required properties and methods. The properties can be assigned values when you create the implementing object, and the methods should have their logic implemented as well.

              Outputs:
              The Animal interface itself doesn't produce any output or value directly, but objects and classes created using this interface will give output based on the provided property values and implemented method functionalities.

              How it achieves its purpose:
              The Animal interface defines three required elements or members:

              1. name (property): This is a string type that stores the animal's name.
              2. makeAnimalSound (method): This is a function that returns a string representing the sound an animal makes when prompted.
              3. isMammal (property): This is a boolean type representing whether or not the animal is a mammal.

              When you create an object or class implementing this interface, you must include these three members in the implementing entity.

              Important Logic Flows or Data Transformations:
              The Animal interface is a static definition and doesn't encompass any active logic flow or data transformation. Implementing classes and objects will contain their logic for individual methods and properties, and the interface is simply a guide.

              Summary:
              In summary, the Animal interface is a simple TypeScript blueprint for classes or objects representing various animals. It defines three members, including two properties and one method. By using the Animal interface to build classes or objects, developers can ensure consistency in their code and provide structure for interacting with and defining animals."
            `,
                explainPollyError
            )
        }, 30_000)

        it('commands/test', async () => {
            await openFile(animalUri)
            const id = await client.request('commands/test', null)
            const lastMessage = await client.firstNonEmptyTranscript(id)
            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `
              "No new imports needed - using existing libs.

              Test coverage includes:

              1. Check if the animal sound is correctly returned
              2. Check if the animal is a mammal
              3. Check if the animal name is correctly set

              Test limitations:

              1. Assumes that the \`makeAnimalSound()\` method returns consistent values for the same animal
              2. Assumes that the \`isMammal\` property does not change

              Here is the completed unit test code:

              \`\`\`typescript
              import { Animal } from "../src/animal";

              describe("Animal", () => {
                  let animal: Animal;

                  beforeEach(() => {
                      animal = {
                          name: "Test Animal",
                          makeAnimalSound: () => "Test Sound",
                          isMammal: true
                      };
                  });

                  it("checks if the animal sound is correctly returned", () => {
                      expect(animal.makeAnimalSound()).toBe("Test Sound");
                  });

                  it("checks if the animal is a mammal", () => {
                      expect(animal.isMammal).toBeTrue();
                  });

                  it("checks if the animal name is correctly set", () => {
                      expect(animal.name).toBe("Test Animal");
                  });
              });
              \`\`\`"
            `,
                explainPollyError
            )
        }, 30_000)

        it('commands/smell', async () => {
            await openFile(animalUri)
            const id = await client.request('commands/smell', null)
            const lastMessage = await client.firstNonEmptyTranscript(id)

            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `
              "Based on the provided TypeScript code, here are some suggestions for improvement:

              1. Add access modifiers to members: By default, all members in an interface are public. Explicitly specifying the access modifier can make the code more readable. Additionally, it is a good practice to follow as it makes it clear to other developers that the member is intended to be accessed from outside the module. For example:
              \`\`\`typescript
              export interface Animal {
                  name: string;
                  makeAnimalSound(): string;
                  isMammal: boolean;
              }
              \`\`\`
              could be changed to:
              \`\`\`typescript
              export interface Animal {
                  readonly name: string;
                  makeAnimalSound(): string;
                  isMammal: boolean;
              }
              \`\`\`
              2. Add type constraints to function parameters: It's a good practice to add type constraints to function parameters. This can improve type safety and make the code more robust. For example:
              \`\`\`typescript
              makeAnimalSound(): string;
              \`\`\`
              could be changed to:
              \`\`\`typescript
              makeAnimalSound(): void;
              \`\`\`
              3. Use consistent spacing: Consistent spacing can improve the readability of the code. Make sure to follow the same spacing conventions throughout the file. For example, make sure there is consistent spacing around the \`:\` symbol:
              \`\`\`typescript
              name: string
              makeAnimalSound(): string
              isMammal: boolean
              \`\`\`
              could be changed to:
              \`\`\`typescript
              name: string;
              makeAnimalSound(): string;
              isMammal: boolean;
              \`\`\`
              4. Consider using an abstract class: If the \`Animal\` interface is meant to be implemented by concrete classes, consider using an abstract class instead. This can help ensure that the implementing classes have common behavior and properties. For example:
              \`\`\`typescript
              export abstract class Animal {
                  public readonly name: string;
                  public isMammal: boolean;

                  constructor(name: string, isMammal: boolean) {
                      this.name = name;
                      this.isMammal = isMammal;
                  }

                  public makeAnimalSound(): void {
                      // Implement the logic here.
                  }
              }
              \`\`\`
              5. Use TypeScript features such as type aliases: TypeScript has many features that can make the code more readable and maintainable. Consider using type aliases for boolean properties, for example:
              \`\`\`typescript
              type IsMammal = boolean;

              export interface Animal {
                  readonly name: string;
                  makeAnimalSound(): void;
                  isMammal: IsMammal;
              }
              \`\`\`
              Overall, the code follows good design principles but there are some opportunities to enhance the code quality. The proposed changes can make the code more robust, efficient, and align with best practices."
            `,
                explainPollyError
            )
        }, 30_000)
    })

    describe('Progress bars', () => {
        it('progress/report', async () => {
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

        it('progress/cancel', async () => {
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
        const rateLimitedClient = new TestClient(
            'rateLimitedClient',
            process.env.SRC_ACCESS_TOKEN_WITH_RATE_LIMIT ??
                // See comment above `const client =` about how this value is derived.
                'REDACTED_8c77b24d9f3d0e679509263c553887f2887d67d33c4e3544039c1889484644f5'
        )
        // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
        beforeAll(async () => {
            const serverInfo = await rateLimitedClient.initialize()

            expect(serverInfo.authStatus?.isLoggedIn).toBeTruthy()
            expect(serverInfo.authStatus?.username).toStrictEqual('david.veszelovszki')
        }, 10_000)

        it('chat/submitMessage (RateLimitError)', async () => {
            const lastMessage = await rateLimitedClient.sendSingleMessageToNewChat('sqrt(9)')
            // Intentionally not a snapshot assertion because we should never
            // automatically update 'RateLimitError' to become another value.
            expect(lastMessage?.error?.name).toStrictEqual('RateLimitError')
        }, 30_000)

        afterAll(async () => {
            await rateLimitedClient.shutdownAndExit()
            // Long timeout because to allow Polly.js to persist HTTP recordings
        }, 30_000)
    })

    describe('Enterprise', () => {
        const enterpriseClient = new TestClient(
            'enterpriseClient',
            process.env.SRC_ENTERPRISE_ACCESS_TOKEN ??
                // See comment above `const client =` about how this value is derived.
                'REDACTED_b20717265e7ab1d132874d8ff0be053ab9c1dacccec8dce0bbba76888b6a0a69',
            'https://demo.sourcegraph.com'
        )
        // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
        beforeAll(async () => {
            const serverInfo = await enterpriseClient.initialize()

            expect(serverInfo.authStatus?.isLoggedIn).toBeTruthy()
            expect(serverInfo.authStatus?.username).toStrictEqual('codytesting')
        }, 10_000)

        it('chat/submitMessage', async () => {
            const lastMessage = await enterpriseClient.sendSingleMessageToNewChat('Reply with "Yes"')
            expect(lastMessage?.text?.trim()).toStrictEqual('Yes')
        }, 20_000)

        afterAll(async () => {
            await enterpriseClient.shutdownAndExit()
            // Long timeout because to allow Polly.js to persist HTTP recordings
        }, 30_000)
    })

    afterAll(async () => {
        await fspromises.rm(workspaceRootPath, { recursive: true, force: true })
        await client.shutdownAndExit()
        // Long timeout because to allow Polly.js to persist HTTP recordings
    }, 30_000)
})

function trimEndOfLine(text: string): string {
    return text
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
}

function asTranscriptMessage(reply: ExtensionMessage): ExtensionTranscriptMessage {
    if (reply.type === 'transcript') {
        return reply
    }
    throw new Error(`expected transcript, got: ${JSON.stringify(reply)}`)
}
