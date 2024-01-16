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
import { MessageHandler } from './jsonrpc-alias'
import {
    type ClientInfo,
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

    public async initialize() {
        this.agentProcess = this.spawnAgentProcess()

        this.connectProcess(this.agentProcess, error => {
            console.error(error)
        })

        this.registerNotification('webview/postMessage', params => {
            this.webviewMessages.push(params)
            this.webviewMessagesEmitter.fire(params)
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

    public async editMessage(id: string, text: string): Promise<ChatMessage | undefined> {
        const reply = asTranscriptMessage(
            await this.request('chat/editMessage', { id, message: { command: 'edit', text } })
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
                CODY_TEMPERATURE_ZERO: 'true',
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

const mayRecord = process.env.CODY_RECORDING_MODE === 'record' || process.env.CODY_RECORD_IF_MISSING === 'true'

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
    if (mayRecord) {
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
                ? document.positionAt(selectionStart)
                : undefined
        const end = cursor >= 0 ? start : selectionEnd >= 0 ? document.positionAt(selectionEnd) : undefined
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
        const lastMessage = await client.sendSingleMessageToNewChat('Hello!')
        expect(lastMessage).toMatchInlineSnapshot(
            `
              {
                "contextFiles": [],
                "displayText": " Hello!",
                "speaker": "assistant",
                "text": " Hello!",
              }
            `,
            explainPollyError
        )
    }, 20_000)

    it('allows us to restore a chat', async () => {
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
    }, 20_000)

    it('allows us to send a longer chat message', async () => {
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

          This program prints "Hello World!" to the console when run. It contains a main method inside a class called Main, as all Java programs require. The println statement prints the text to the console.

          To run this:

          1. Save the code in a file called Main.java
          2. Compile it with: javac Main.java
          3. Run it with: java Main

          The "Hello World!" text will be printed to the console.

          Let me know if you need any clarification or have additional requirements for the Java program!"
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

            constructor(name: string) {
              this.name = name;
            }

            makeAnimalSound() {
              return 'Woof!';
            }

            isMammal = true;
          }
          \`\`\`"
        `,
            explainPollyError
        )
    }, 20_000)

    describe('Commands', () => {
        it('explain', async () => {
            await openFile(animalUri)
            const id = await client.request('commands/explain', null)
            const lastMessage = await client.firstNonEmptyTranscript(id)
            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `
              " The selected code defines an Animal interface in TypeScript.

              An interface in TypeScript is a way to define a "contract" that other classes or objects can implement. This allows enforcing certain properties and methods on objects that implement the interface.

              Specifically, this Animal interface defines:

              1. A name property of type string. This will be used to store the animal's name.

              2. A makeAnimalSound() method that returns a string. This will be implemented by classes to make an animal noise unique to that animal.

              3. An isMammal property of type boolean. This indicates whether the animal is a mammal or not.

              So in summary, this Animal interface defines the blueprint for an object representing an animal. Anything implementing this interface would need to have a name, have a way to make a sound, and specify whether it's a mammal or not. This allows enforcing a consistent API for animal objects in the codebase.

              The interface itself doesn't contain any implementation logic. It just defines the contract. Concrete classes would then implement the Animal interface to provide the actual logic and data for specific animal instances. Those classes would ensure they fulfill the contract by matching the interface's property and method signatures.

              So in essence, this interface sets up a reusable way to model animal objects in a standardized way. The consuming code can just rely on the Animal interface without worrying about the details of specific animal types."
            `,
                explainPollyError
            )
        }, 20_000)

        it('test', async () => {
            await openFile(animalUri)
            const id = await client.request('commands/test', null)
            const lastMessage = await client.firstNonEmptyTranscript(id)
            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `
              " No test framework or libraries are imported in the shared context code. Since this is TypeScript code, I will generate Jest tests:

              \`\`\`typescript
              import { Animal } from './animal';

              describe('Animal', () => {
                it('should return the animal sound', () => {
                  const dog: Animal = {
                    name: 'Dog',
                    makeAnimalSound: () => 'Woof',
                    isMammal: true
                  };

                  expect(dog.makeAnimalSound()).toBe('Woof');
                });

                it('should have a boolean isMammal property', () => {
                  const cat: Animal = {
                    name: 'Cat',
                    makeAnimalSound: () => 'Meow',
                    isMammal: true
                  };

                  expect(typeof cat.isMammal).toBe('boolean');
                });

                it('should throw if makeAnimalSound is not a function', () => {
                  const invalidAnimal: Animal = {
                    name: 'Fish',
                    makeAnimalSound: 'Blub',
                    isMammal: false
                  };

                  expect(() => invalidAnimal.makeAnimalSound()).toThrow();
                });
              });
              \`\`\`

              This adds Jest and generates a basic test suite that validates the Animal interface contract. It tests the makeAnimalSound method returns the expected sound, isMammal is a boolean, and makeAnimalSound throws if not a function. There may be more edge cases to cover, but this provides a starting set of tests."
            `,
                explainPollyError
            )
        }, 20_000)

        it('smell', async () => {
            await openFile(animalUri)
            const id = await client.request('commands/smell', null)
            const lastMessage = await client.firstNonEmptyTranscript(id)

            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `
              " Here are 5 potential improvements for the selected TypeScript code:

              1. Add type annotations for method parameters and return types:

              \`\`\`
              export interface Animal {
                name: string;
                makeAnimalSound(volume?: number): string;
                isMammal: boolean;
              }
              \`\`\`

              Adding type annotations makes the code more self-documenting and enables stronger type checking.

              2. Make interface name PascalCase:

              \`\`\`
              export interface Animal {
                // ...
              }
              \`\`\`

              The PascalCase convention is standard for TypeScript interfaces.

              3. Make method names camelCase:

              \`\`\`
              makeAnimalSound() {
                // ...
              }
              \`\`\`

              camelCase is the standard naming convention for methods in TypeScript.

              4. Add JSDoc comments for documentation:

              \`\`\`
              /**
               * Represents an animal.
               */
              export interface Animal {
                // ...
              }
              \`\`\`

              JSDoc comments improve documentation and discoverability.

              5. Export class instead of interface:

              \`\`\`
              export class Animal {
                // ...
              }
              \`\`\`

              A class is more standard and flexible than an interface for this use case.

              Overall, the selected code follows reasonable design practices. The suggestions above are minor enhancements to improve type safety, conventions, documentation and flexibility. Aside from those opportunities, the code is well-structured."
            `,
                explainPollyError
            )
        }, 20_000)
    })

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

        it('allows us to set the chat model', async () => {
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
        })

        it('resets the chat', async () => {
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
    })

    describe('RateLimitedAgent', () => {
        const rateLimitedClient = new TestClient('rateLimitedClient', process.env.SRC_ACCESS_TOKEN_WITH_RATE_LIMIT)
        // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
        beforeAll(async () => {
            await rateLimitedClient.initialize()
        }, 10_000)

        it('get rate limit error if exceeding usage on rate limited account', async () => {
            const lastMessage = await rateLimitedClient.sendSingleMessageToNewChat('sqrt(9)')
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

function asTranscriptMessage(reply: ExtensionMessage): ExtensionTranscriptMessage {
    if (reply.type === 'transcript') {
        return reply
    }
    throw new Error(`expected transcript, got: ${JSON.stringify(reply)}`)
}
