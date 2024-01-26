import assert from 'assert'
import { execSync, spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import fspromises from 'fs/promises'
import os from 'os'
import path from 'path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { Uri } from 'vscode'

import { logError, type ChatMessage, type ContextFile, isWindows } from '@sourcegraph/cody-shared'

import type { ExtensionMessage, ExtensionTranscriptMessage } from '../../vscode/src/chat/protocol'

import { AgentTextDocument } from './AgentTextDocument'
import { MessageHandler, type NotificationMethodName } from './jsonrpc-alias'
import type {
    ClientInfo,
    EditTask,
    ExtensionConfiguration,
    ProgressReportParams,
    ProgressStartParams,
    ProtocolCodeLens,
    ServerInfo,
    WebviewPostMessageParams,
} from './protocol-alias'
import { URI } from 'vscode-uri'
import { CodyTaskState } from '../../vscode/src/non-stop/utils'
import { AgentWorkspaceDocuments } from './AgentWorkspaceDocuments'
import { ProtocolTextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'
import { applyPatch } from 'fast-myers-diff'
import { isNode16 } from './isNode16'

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
    message: Record<string, never>
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
    public workspace = new AgentWorkspaceDocuments()

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
            this.progressMessages.push({
                method: 'progress/start',
                id: message.id,
                message,
            })
        })
        this.registerNotification('progress/report', message => {
            message.id = this.progressID(message.id)
            this.progressMessages.push({
                method: 'progress/report',
                id: message.id,
                message,
            })
        })
        this.registerNotification('progress/end', ({ id }) => {
            this.progressMessages.push({
                method: 'progress/end',
                id: this.progressID(id),
                message: {},
            })
        })
        this.registerNotification('codeLenses/display', async params => {
            this.codeLenses.set(params.uri, params.codeLenses)
        })
        this.registerRequest('textDocument/edit', async params => {
            const document = this.workspace.getDocument(vscode.Uri.parse(params.uri))
            if (!document) {
                logError('textDocument/edit: document not found', params.uri)
                return false
            }
            const patches = params.edits.map<[number, number, string]>(edit => {
                switch (edit.type) {
                    case 'delete':
                        return [
                            document.offsetAt(edit.range.start),
                            document.offsetAt(edit.range.end),
                            '',
                        ]
                    case 'insert':
                        return [
                            document.offsetAt(edit.position),
                            document.offsetAt(edit.position),
                            edit.value,
                        ]
                    case 'replace':
                        return [
                            document.offsetAt(edit.range.start),
                            document.offsetAt(edit.range.end),
                            edit.value,
                        ]
                }
            })
            const updatedContent = [...applyPatch(document.content, patches)].join('')
            this.workspace.addDocument(
                ProtocolTextDocumentWithUri.from(document.uri, { content: updatedContent })
            )
            return true
        })
        this.registerNotification('debug/message', message => {
            // Uncomment below to see `logDebug` messages.
            // console.log(`${message.channel}: ${message.message}`)
        })
    }

    public openFile(
        uri: Uri,
        params?: { selectionName?: string; removeCursor?: boolean }
    ): Promise<void> {
        return this.textDocumentEvent(uri, 'textDocument/didOpen', params)
    }
    public changeFile(
        uri: Uri,
        params?: { selectionName?: string; removeCursor?: boolean }
    ): Promise<void> {
        return this.textDocumentEvent(uri, 'textDocument/didChange', params)
    }

    public async textDocumentEvent(
        uri: Uri,
        method: NotificationMethodName,
        params?: { selectionName?: string; removeCursor?: boolean }
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
        if (params?.removeCursor ?? true) {
            content = content.replace('/* CURSOR */', '')
        }

        const document = AgentTextDocument.from(uri, content)
        const start =
            cursor >= 0
                ? document.positionAt(cursor)
                : selectionStart >= 0
                  ? document.positionAt(selectionStart + selectionStartMarker.length)
                  : undefined
        const end =
            cursor >= 0 ? start : selectionEnd >= 0 ? document.positionAt(selectionEnd) : undefined
        const protocolDocument = {
            uri: uri.toString(),
            content,
            selection: start && end ? { start, end } : undefined,
        }
        this.workspace.addDocument(ProtocolTextDocumentWithUri.fromDocument(protocolDocument))
        this.notify(method, protocolDocument)
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

    /**
     * Promise that resolves when the provided task has reached the 'applied' state.
     */
    public taskHasReachedAppliedPhase(params: EditTask): Promise<void> {
        switch (params.state) {
            case CodyTaskState.applied:
                return Promise.resolve()
            case CodyTaskState.finished:
            case CodyTaskState.error:
                return Promise.reject(
                    new Error(`Task reached terminal state before being applied ${params}`)
                )
        }

        let disposable: vscode.Disposable
        return new Promise<void>((resolve, reject) => {
            disposable = this.onDidChangeTaskState(({ id, state }) => {
                if (id === params.id) {
                    switch (state) {
                        case CodyTaskState.applied:
                            return resolve()
                        case CodyTaskState.error:
                        case CodyTaskState.finished:
                            return reject(
                                new Error(
                                    `Task reached terminal state before being applied ${{ id, state }}`
                                )
                            )
                    }
                }
            })
        }).finally(() => disposable.dispose())
    }

    public codeLenses = new Map<string, ProtocolCodeLens[]>()
    public newTaskState = new vscode.EventEmitter<EditTask>()
    public onDidChangeTaskState = this.newTaskState.event
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
        this.registerNotification('editTaskState/didChange', params => {
            this.newTaskState.fire(params)
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
            }
            if (error instanceof Error) {
                throw error
            }
            throw new TypeError(`Agent failed to initialize, error is ${JSON.stringify(error)}`, {
                cause: error,
            })
        }
    }

    public async setChatModel(id: string, model: string): Promise<void> {
        await this.request('webview/receiveMessage', {
            id,
            message: { command: 'chatModel', model },
        })
    }

    public async reset(id: string): Promise<void> {
        await this.request('webview/receiveMessage', {
            id,
            message: { command: 'reset' },
        })
    }

    public async editMessage(
        id: string,
        text: string,
        params?: { addEnhancedContext?: boolean; contextFiles?: ContextFile[]; index?: number }
    ): Promise<ChatMessage | undefined> {
        const reply = asTranscriptMessage(
            await this.request('chat/editMessage', {
                id,
                message: {
                    command: 'edit',
                    text,
                    index: params?.index,
                    contextFiles: params?.contextFiles ?? [],
                    addEnhancedContext: params?.addEnhancedContext ?? false,
                },
            })
        )
        return reply.messages.at(-1)
    }

    public async sendMessage(
        id: string,
        text: string,
        params?: { addEnhancedContext?: boolean; contextFiles?: ContextFile[] }
    ): Promise<ChatMessage | undefined> {
        return (await this.sendSingleMessageToNewChatWithFullTranscript(text, { ...params, id }))
            ?.lastMessage
    }

    public async sendSingleMessageToNewChat(
        text: string,
        params?: { addEnhancedContext?: boolean; contextFiles?: ContextFile[] }
    ): Promise<ChatMessage | undefined> {
        return (await this.sendSingleMessageToNewChatWithFullTranscript(text, params))?.lastMessage
    }

    public async sendSingleMessageToNewChatWithFullTranscript(
        text: string,
        params?: { addEnhancedContext?: boolean; contextFiles?: ContextFile[]; id?: string }
    ): Promise<{ lastMessage?: ChatMessage; panelID: string; transcript: ExtensionTranscriptMessage }> {
        const id = params?.id ?? (await this.request('chat/new', null))
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
        return { panelID: id, transcript: reply, lastMessage: reply.messages.at(-1) }
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
                edit: 'enabled',
                codeLenses: 'enabled',
            },
            extensionConfiguration: {
                anonymousUserID: `${this.name}abcde1234`,
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

const mayRecord =
    process.env.CODY_RECORDING_MODE === 'record' || process.env.CODY_RECORD_IF_MISSING === 'true'

describe('Agent', () => {
    const dotcom = 'https://sourcegraph.com'
    if (mayRecord) {
        execSync('src login', { stdio: 'inherit' })
        assert.strictEqual(
            process.env.SRC_ENDPOINT,
            dotcom,
            'SRC_ENDPOINT must be https://sourcegraph.com'
        )
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
        process.env.SRC_ACCESS_TOKEN ??
            'REDACTED_3709f5bf232c2abca4c612f0768368b57919ca6eaa470e3fd7160cbf3e8d0ec3'
    )

    // Bundle the agent. When running `pnpm run test`, vitest doesn't re-run this step.
    //
    // ⚠️ If this line fails when running unit tests, chances are that the error is being swallowed.
    // To see the full error, run this file in isolation:
    //
    //   pnpm test agent/src/index.test.ts
    execSync('pnpm run build:agent', {
        cwd: client.getAgentDir(),
        stdio: 'inherit',
    })

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

    beforeEach(async () => {
        await client.request('testing/reset', null)
    })

    const sumPath = path.join(workspaceRootPath, 'src', 'sum.ts')
    const sumUri = Uri.file(sumPath)
    const animalPath = path.join(workspaceRootPath, 'src', 'animal.ts')
    const animalUri = Uri.file(animalPath)
    const squirrelPath = path.join(workspaceRootPath, 'src', 'squirrel.ts')
    const squirrelUri = Uri.file(squirrelPath)
    const multipleSelections = path.join(workspaceRootPath, 'src', 'multiple-selections.ts')
    const multipleSelectionsUri = Uri.file(multipleSelections)

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
        await client.openFile(sumUri)
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
        client.notify('autocomplete/completionAccepted', {
            completionID: completions.items[0].id,
        })
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
            const lastMessage = await client.sendSingleMessageToNewChat(
                'Generate simple hello world function in java!'
            )
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
            await client.openFile(animalUri)
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
              export class Dog implements Animal {
                name: string;

                makeAnimalSound() {
                  return "Bark!";
                }

                isMammal = true;
              }
              \`\`\`"
            `,
                explainPollyError
            )
        }, 30_000)

        it('chat/submitMessage (addEnhancedContext: true, squirrel test)', async () => {
            await client.openFile(squirrelUri)
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
            const { lastMessage, transcript } =
                await client.sendSingleMessageToNewChatWithFullTranscript('What is Squirrel?', {
                    addEnhancedContext: true,
                })
            expect(lastMessage?.text?.toLocaleLowerCase() ?? '').includes('code nav')
            expect(lastMessage?.text?.toLocaleLowerCase() ?? '').includes('sourcegraph')
            decodeURIs(transcript)
            const contextFiles = transcript.messages.flatMap(m => m.contextFiles ?? [])
            expect(contextFiles).not.toHaveLength(0)
            expect(contextFiles.map(file => file.uri.toString())).includes(squirrelUri.toString())
        }, 30_000)

        // Workaround for the fact that `ContextFile.uri` is a class that
        // serializes to JSON as an object, and deserializes back into a JS
        // object instead of the class. Without this,
        // `ContextFile.uri.toString()` return `"[Object object]".
        function decodeURIs(transcript: ExtensionTranscriptMessage): void {
            for (const message of transcript.messages) {
                if (message.contextFiles) {
                    for (const file of message.contextFiles) {
                        file.uri = URI.from(file.uri)
                    }
                }
            }
        }

        it('webview/receiveMessage (type: chatModel)', async () => {
            const id = await client.request('chat/new', null)
            {
                await client.setChatModel(id, 'openai/gpt-3.5-turbo')
                const lastMessage = await client.sendMessage(
                    id,
                    'which company, other than sourcegraph, created you?'
                )
                expect(lastMessage?.text?.toLocaleLowerCase().includes('openai')).toBeTruthy()
            }
            {
                await client.setChatModel(id, 'anthropic/claude-2.0')
                const lastMessage = await client.sendMessage(
                    id,
                    'which company, other than sourcegraph, created you?'
                )
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

        // Tests for edits would fail on Node 16 (ubuntu16) possibly due to an API that is not supported
        describe.skipIf(isNode16())('chat/editMessage', () => {
            it(
                'edits the last human chat message',
                async () => {
                    const id = await client.request('chat/new', null)
                    await client.setChatModel(
                        id,
                        'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct'
                    )
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

            it('edits messages by index', async () => {
                const id = await client.request('chat/new', null)
                await client.setChatModel(
                    id,
                    'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct'
                )
                // edits by index replaces message at index, and erases all subsequent messages
                await client.sendMessage(
                    id,
                    'I have a turtle named "potter", reply single "ok" if you understand.'
                )
                await client.sendMessage(
                    id,
                    'I have a bird named "skywalker", reply single "ok" if you understand.'
                )
                await client.sendMessage(
                    id,
                    'I have a dog named "happy", reply single "ok" if you understand.'
                )
                await client.editMessage(
                    id,
                    'I have a tiger named "zorro", reply single "ok" if you understand',
                    { index: 2 }
                )
                {
                    const lastMessage = await client.sendMessage(id, 'What pets do I have?')
                    const answer = lastMessage?.text?.toLocaleLowerCase()
                    expect(answer?.includes('turtle')).toBeTruthy()
                    expect(answer?.includes('tiger')).toBeTruthy()
                    expect(answer?.includes('bird')).toBeFalsy()
                    expect(answer?.includes('dog')).toBeFalsy()
                }
            }, 30_000)
        })
    })

    describe('Text documents', () => {
        it('chat/submitMessage (understands the selected text)', async () => {
            await client.request('command/execute', { command: 'cody.search.index-update' })
            await client.openFile(multipleSelectionsUri)
            await client.changeFile(multipleSelectionsUri)
            await client.changeFile(multipleSelectionsUri, {
                selectionName: 'SELECTION_2',
            })
            const reply = await client.sendSingleMessageToNewChat(
                'What is the name of the function that I have selected? Only answer with the name of the function, nothing else',
                { addEnhancedContext: true }
            )
            expect(reply?.text?.trim()).includes('anotherFunction')
            expect(reply?.text?.trim()).not.includes('inner')
            await client.changeFile(multipleSelectionsUri)
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
            await client.request('command/execute', { command: 'cody.search.index-update' })
            await client.openFile(animalUri)
            const id = await client.request('commands/explain', null)
            const lastMessage = await client.firstNonEmptyTranscript(id)
            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `
              " Here is an explanation of the selected TypeScript code in simple terms:

              The Animal interface

              The Animal interface defines the shape of an Animal object. It does not contain any actual implementation, just declarations for what properties and methods an Animal object should have.

              The interface has three members:

              1. name - This is a string property to store the animal's name.

              2. makeAnimalSound() - This is a method that should return a string representing the sound the animal makes.

              3. isMammal - This is a boolean property that indicates if the animal is a mammal or not.

              The purpose of this interface is to define a consistent structure for Animal objects. Any class that implements the Animal interface will be required to have these three members with these types.

              This allows code dealing with Animal objects to know it can call animal.makeAnimalSound() and access animal.name and animal.isMammal, regardless of the specific class. The interface defines the contract between the implementation and usage of Animals, without caring about specific details.

              Interfaces like this are useful for writing reusable code that can handle different types of objects in a consistent way. The code using the interface doesn't need to know about the specifics of each class, just that it implements the Animal interface. This allows easily extending the code to handle new types of animals by simply creating a new class implementing Animal.

              So in summary, the Animal interface defines the input expectations and output guarantees for objects representing animals in the system, allowing code to work with any animal in a generic way based on this contract."
            `,
                explainPollyError
            )
        }, 30_000)

        // This test seems extra sensitive on Node v16 for some reason.
        it.skipIf(isNode16() || isWindows())(
            'commands/test',
            async () => {
                await client.request('command/execute', { command: 'cody.search.index-update' })
                await client.openFile(animalUri)
                const id = await client.request('commands/test', null)
                const lastMessage = await client.firstNonEmptyTranscript(id)
                expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                    `
                  " Okay, based on the shared context, it looks like Vitest is being used as the test framework. No mocks are detected.

                  Here are some new unit tests for the Animal interface in src/animal.ts using Vitest:

                  \`\`\`ts
                  import {describe, expect, it} from 'vitest'
                  import {Animal} from './animal'

                  describe('Animal', () => {

                    it('has a name property', () => {
                      const animal: Animal = {
                        name: 'Leo',
                        makeAnimalSound() {
                          return 'Roar'
                        },
                        isMammal: true
                      }

                      expect(animal.name).toBe('Leo')
                    })

                    it('has a makeAnimalSound method', () => {
                      const animal: Animal = {
                        name: 'Whale',
                        makeAnimalSound() {
                          return 'Whistle'
                        },
                        isMammal: true
                      }

                      expect(animal.makeAnimalSound()).toBe('Whistle')
                   }

                    it('has an isMammal property', () => {
                      const animal: Animal = {
                        name: 'Snake',
                        makeAnimalSound() {
                          return 'Hiss'
                        },
                        isMammal: false
                      }

                      expect(animal.isMammal).toBe(false)
                    })

                  })
                  \`\`\`

                  This covers basic validation of the Animal interface properties and methods using Vitest assertions. Additional test cases could be added for more edge cases."
                `,
                    explainPollyError
                )
            },
            30_000
        )

        it('commands/smell', async () => {
            await client.openFile(animalUri)
            const id = await client.request('commands/smell', null)
            const lastMessage = await client.firstNonEmptyTranscript(id)

            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `
              " Here are 5 potential improvements for the selected TypeScript code:

              1. Add type annotations for method parameters and return values:

              \`\`\`
              export interface Animal {
                name: string
                makeAnimalSound(volume?: number): string
                isMammal: boolean
              }
              \`\`\`

              Adding type annotations makes the code more self-documenting and enables stronger type checking.

              2. Make interface name more semantic:

              \`\`\`
              export interface Creature {
                // ...
              }
              \`\`\`

              The name 'Animal' is not very descriptive. A name like 'Creature' captures the intent better.

              3. Make sound method name more semantic:

              \`\`\`
              makeSound()
              \`\`\`

              The name 'makeAnimalSound' is verbose. A shorter name like 'makeSound' conveys the purpose clearly.

              4. Use boolean type for isMammal property:

              \`\`\`
              isMammal: boolean
              \`\`\`

              Using the boolean type instead of just true/false improves readability.

              5. Add JSDoc comments for documentation:

              \`\`\`
              /**
               * Represents a creature in the game
               */
              export interface Creature {
                // ...
              }
              \`\`\`

              JSDoc comments enable generating API documentation and improve understandability.

              Overall, the selected code follows reasonable design principles. The interface encapsulates animal data nicely. The suggestions above would incrementally improve quality but no major issues were found."
            `,
                explainPollyError
            )
        }, 30_000)

        describe('Document code', () => {
            function check(name: string, filename: string, assertion: (obtained: string) => void): void {
                it(name, async () => {
                    await client.request('command/execute', { command: 'cody.search.index-update' })
                    const uri = Uri.file(path.join(workspaceRootPath, 'src', filename))
                    await client.openFile(uri, { removeCursor: false })
                    const task = await client.request('commands/document', null)
                    await client.taskHasReachedAppliedPhase(task)
                    const lenses = client.codeLenses.get(uri.toString()) ?? []
                    expect(lenses).toHaveLength(4) // Show diff, accept, retry , undo
                    const acceptCommand = lenses.find(
                        ({ command }) => command?.command === 'cody.fixup.codelens.accept'
                    )
                    if (acceptCommand === undefined || acceptCommand.command === undefined) {
                        throw new Error(
                            `Expected accept command, found none. Lenses ${JSON.stringify(
                                lenses,
                                null,
                                2
                            )}`
                        )
                    }
                    await client.request('command/execute', acceptCommand.command)
                    expect(client.codeLenses.get(uri.toString()) ?? []).toHaveLength(0)
                    const newContent = client.workspace.getDocument(uri)?.content
                    assertion(trimEndOfLine(newContent))
                })
            }

            check('commands/document (basic function)', 'sum.ts', obtained =>
                expect(obtained).toMatchInlineSnapshot(`
                  "/**
                   * Sums two numbers.
                   * @param a - The first number to sum.
                   * @param b - The second number to sum.
                   * @returns The sum of a and b.
                   */
                  export function sum(a: number, b: number): number {
                      /* CURSOR */
                  }
                  "
                `)
            )

            check('commands/document (Method as part of a class)', 'TestClass.ts', obtained =>
                expect(obtained).toMatchInlineSnapshot(`
                  "const foo = 42

                  export class TestClass {
                      constructor(private shouldGreet: boolean) {}

                      /**
                       * Prints "Hello World!" to the console if this.shouldGreet is true.
                       * This allows conditionally greeting the user.
                       */
                      public functionName() {
                          if (this.shouldGreet) {
                              console.log(/* CURSOR */ 'Hello World!')
                          }
                      }
                  }
                  "
                `)
            )

            check('commands/document (Function within a property)', 'TestLogger.ts', obtained =>
                expect(obtained).toMatchInlineSnapshot(`
                  "const foo = 42
                  /**
                   * TestLogger object that contains a startLogging method to initialize logging.
                   * startLogging sets up a recordLog function that writes log messages to the console.
                   */
                  export const TestLogger = {
                      startLogging: () => {
                          // Do some stuff

                          function recordLog() {
                              console.log(/* CURSOR */ 'Recording the log')
                          }

                          recordLog()
                      },
                  }
                  "
                `)
            )

            check('commands/document (nested test case)', 'example.test.ts', obtained =>
                expect(obtained).toMatchInlineSnapshot(`
                  "import { expect } from 'vitest'
                  import { it } from 'vitest'
                  import { describe } from 'vitest'

                  /**
                   * Test block that runs a set of test cases.
                   *
                   * Contains 3 test cases:
                   * - 'does 1' checks an expectation
                   * - 'does 2' checks an expectation
                   * - 'does something else' has a commented out line that errors
                   */
                  describe('test block', () => {
                      it('does 1', () => {
                          expect(true).toBe(true)
                      })

                      it('does 2', () => {
                          expect(true).toBe(true)
                      })

                      it('does something else', () => {
                          // This line will error due to incorrect usage of \`performance.now\`
                          const startTime = performance.now(/* CURSOR */)
                      })
                  })
                  "
                `)
            )
        })
    })

    describe('Progress bars', () => {
        it('progress/report', async () => {
            const { result } = await client.request('testing/progress', {
                title: 'Susan',
            })
            expect(result).toStrictEqual('Hello Susan')
            let progressID: string | undefined
            for (const message of client.progressMessages) {
                if (
                    message.method === 'progress/start' &&
                    message.message.options.title === 'testing/progress'
                ) {
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
                const { result } = await client.request('testing/progressCancelation', {
                    title: 'Leona',
                })
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
        await fspromises.rm(workspaceRootPath, {
            recursive: true,
            force: true,
        })
        await client.shutdownAndExit()
        // Long timeout because to allow Polly.js to persist HTTP recordings
    }, 30_000)
})

function trimEndOfLine(text: string | undefined): string {
    if (text === undefined) {
        return ''
    }
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
