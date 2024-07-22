import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    type ContextItem,
    DOTCOM_URL,
    ModelUsage,
    ModelsService,
    getDotComDefaultModels,
    isWindows,
} from '@sourcegraph/cody-shared'

import * as uuid from 'uuid'
import { ResponseError } from 'vscode-jsonrpc'
import { URI } from 'vscode-uri'
import { CodyJsonRpcErrorCode } from '../../vscode/src/jsonrpc/CodyJsonRpcErrorCode'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { logTestingData } from '../../vscode/test/fixtures/mock-server'
import { TestClient, asTranscriptMessage } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import { decodeURIs } from './decodeURIs'
import { explainPollyError } from './explainPollyError'
import type { NetworkRequest, Requests } from './protocol-alias'
import { trimEndOfLine } from './trimEndOfLine'
const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))

const mayRecord =
    process.env.CODY_RECORDING_MODE === 'record' || process.env.CODY_RECORD_IF_MISSING === 'true'

function getTelemetryEvents(requests: NetworkRequest[]): {
    loggedTelemetryEventsV2: string[]
} {
    const v2Requests = requests.filter(req => req.url.includes('RecordTelemetryEvents'))

    const v2Events = v2Requests.flatMap(req => {
        if (!req || !req.body) return []

        const { variables } = JSON.parse(req.body)
        return variables.events.map((event: { feature: string; action: string }) => {
            return `${event.feature}:${event.action}`
        })
    })

    return {
        loggedTelemetryEventsV2: v2Events,
    }
}

function safeJsonParse(str: string | null | undefined) {
    if (!str) return null
    try {
        return JSON.parse(str)
    } catch (e) {
        console.error('Failed to parse JSON:', e)
        return null
    }
}

describe('Agent', () => {
    let expectedEvents: string[] | undefined
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'defaultClient',
        credentials: TESTING_CREDENTIALS.dotcom,
        // set telemetryExporter to `graphql` to receive telemetryRecorder requests and determine whats events have been logged
        telemetryExporter: 'graphql',
    })

    const mockEnhancedContext: ContextItem[] = []

    // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
    beforeAll(async () => {
        ModelsService.setModels(getDotComDefaultModels())
        await workspace.beforeAll()

        // Init a repo in the workspace to make the parent-dirs repo-name resolver work for Cody Context Filters tests.
        spawnSync('git', ['init'], { cwd: workspace.rootPath, stdio: 'inherit' })
        spawnSync('git', ['remote', 'add', 'origin', 'git@github.com:sourcegraph/cody.git'], {
            cwd: workspace.rootPath,
            stdio: 'inherit',
        })

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
            serverEndpoint: client.info.extensionConfiguration?.serverEndpoint ?? DOTCOM_URL.toString(),
            customHeaders: {},
        })
        expect(valid?.isLoggedIn).toBeTruthy()

        for (const name of [
            'src/animal.ts',
            'src/ChatColumn.tsx',
            'src/Heading.tsx',
            'src/squirrel.ts',
            'src/multiple-selections.ts',
        ]) {
            const item = await workspace.loadContextItem(name)
            // Trim content to the first 20 lines to imitate enhanced context, which only includes file chunks
            item.content = item.content?.split('\n').slice(0, 20).join('\n')
            mockEnhancedContext.push(item)
        }

        // Confirm .cody/ignore is active at start up
        const ignore = await client.request('ignore/test', {
            uri: URI.file(ignoredUri.fsPath).toString(),
        })
        // TODO(dpc): Integrate file-based .cody/ignore with ignore/test
        expect(ignore.policy).toBe('use')
    }, 20_000)

    beforeEach(async () => {
        await client.request('testing/reset', null)
        // reset expectedEvents before each test
        expectedEvents = undefined
    })

    afterEach(async () => {
        const { requests } = await client.request('testing/networkRequests', null)
        const telemetryEvents = getTelemetryEvents(requests)
        const telemetryRequests = requests.filter(req => req.url.includes('RecordTelemetryEvents'))
        const testRunId = uuid.v4()
        // for each request in telemetry request, send to logTestData
        for (const req of telemetryRequests) {
            // Parse the request body
            const bodyObject = safeJsonParse(req.body)
            let variables: string
            if (bodyObject.variables.events.length > 1) {
                variables = bodyObject.variables
            } else {
                variables = bodyObject.variables.events[0]
            }
            logTestingData(
                JSON.stringify(variables),
                'v2-agent-e2e',
                expect.getState().currentTestName,
                testRunId
            )
        }
        if (expectedEvents) {
            expect(telemetryEvents.loggedTelemetryEventsV2).toEqual(
                expect.arrayContaining(expectedEvents)
            )
        }
    })

    const sumUri = workspace.file('src', 'sum.ts')
    const animalUri = workspace.file('src', 'animal.ts')
    const squirrelUri = workspace.file('src', 'squirrel.ts')
    const multipleSelectionsUri = workspace.file('src', 'multiple-selections.ts')

    // Context files ends with 'Ignored.ts' will be excluded by .cody/ignore
    const ignoredUri = workspace.file('src', 'isIgnored.ts')

    it('extensionConfiguration/change & chat/models (handle errors)', async () => {
        // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
        expectedEvents = [
            'cody.auth:failed',
            'cody.auth.login:firstEver',
            'cody.auth:connected',
            'cody.codyIgnore:hasFile',
        ]
        // Send two config change notifications because this is what the
        // JetBrains client does and there was a bug where everything worked
        // fine as long as we didn't send the second unauthenticated config
        // change.
        const initModelName = 'anthropic/claude-3-5-sonnet-20240620'
        const {
            models: [initModel],
        } = await client.request('chat/models', { modelUsage: ModelUsage.Chat })
        expect(initModel.model).toStrictEqual(initModelName)

        const invalid = await client.request('extensionConfiguration/change', {
            ...client.info.extensionConfiguration,
            anonymousUserID: 'abcde1234',
            // Redacted format of an invalid access token (just random string). Tests fail in replay mode
            // if we don't use the redacted format here.
            accessToken: 'REDACTED_0ba08837494d00e3943c46999589eb29a210ba8063f084fff511c8e4d1503909',
            serverEndpoint: 'https://sourcegraph.com/',
            customHeaders: {},
        })
        expect(invalid?.isLoggedIn).toBeFalsy()
        const invalidModels = await client.request('chat/models', { modelUsage: ModelUsage.Chat })
        expect(invalidModels.models).toStrictEqual([])

        const valid = await client.request('extensionConfiguration/change', {
            ...client.info.extensionConfiguration,
            anonymousUserID: 'abcde1234',
            accessToken: client.info.extensionConfiguration?.accessToken ?? 'invalid',
            serverEndpoint: client.info.extensionConfiguration?.serverEndpoint ?? DOTCOM_URL.toString(),
            customHeaders: {},
        })
        expect(valid?.isLoggedIn).toBeTruthy()

        const reauthenticatedModels = await client.request('chat/models', {
            modelUsage: ModelUsage.Chat,
        })
        expect(reauthenticatedModels.models).not.toStrictEqual([])
        expect(reauthenticatedModels.models[0].model).toStrictEqual(initModelName)

        // Please don't update the recordings to use a different account without consulting #team-cody-core.
        // When changing an account, you also need to update the REDACTED_ hash above.
        //
        // To update the recordings with the correct account, run the following command
        // from the root of this repository:
        //
        //    source agent/scripts/export-cody-http-recording-tokens.sh
        //
        // If you don't have access to this private file then you need to ask
        expect(valid?.username).toStrictEqual('sourcegraphbot9k-fnwmu')
    }, 10_000)

    it('graphql/getCurrentUserCodySubscription', async () => {
        // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
        expectedEvents = [
            'cody.auth:failed',
            'cody.auth.login:firstEver',
            'cody.auth:connected',
            'cody.codyIgnore:hasFile',
        ]
        const currentUserCodySubscription = await client.request(
            'graphql/getCurrentUserCodySubscription',
            null
        )
        expect(currentUserCodySubscription).toMatchInlineSnapshot(`
          {
            "applyProRateLimits": true,
            "currentPeriodEndAt": "2024-07-14T22:11:32Z",
            "currentPeriodStartAt": "2024-06-14T22:11:32Z",
            "plan": "PRO",
            "status": "ACTIVE",
          }
        `)
    }, 10_000)

    describe('Chat', () => {
        it('chat/submitMessage (short message)', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.codyIgnore:hasFile',
            ]
            const lastMessage = await client.sendSingleMessageToNewChat('Hello!')
            expect(lastMessage).toMatchInlineSnapshot(
                `
              {
                "model": "anthropic/claude-3-5-sonnet-20240620",
                "speaker": "assistant",
                "text": "Hello! I'm Cody, an AI coding assistant from Sourcegraph. How can I help you with coding today? Whether you need help with a specific programming language, debugging, code optimization, or any other coding-related task, I'm here to assist you. What would you like to work on?",
              }
            `
            )
        }, 30_000)

        it('chat/submitMessage (long message)', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.chatResponse:hasCode',
                'cody.codyIgnore:hasFile',
            ]
            const lastMessage = await client.sendSingleMessageToNewChat(
                'Generate simple hello world function in java!'
            )
            const trimmedMessage = trimEndOfLine(lastMessage?.text ?? '')
            expect(trimmedMessage).toMatchInlineSnapshot(
                `
              "Certainly! Here's a simple "Hello, World!" function in Java:

              \`\`\`java
              public class HelloWorld {
                  public static void main(String[] args) {
                      sayHello();
                  }

                  public static void sayHello() {
                      System.out.println("Hello, World!");
                  }
              }
              \`\`\`

              This Java code does the following:

              1. We define a class called \`HelloWorld\`.
              2. Inside the class, we have the \`main\` method, which is the entry point of any Java program.
              3. We create a separate method called \`sayHello()\` that prints "Hello, World!" to the console.
              4. In the \`main\` method, we call the \`sayHello()\` function.

              When you run this program, it will output:

              \`\`\`
              Hello, World!
              \`\`\`

              To run this program:

              1. Save the code in a file named \`HelloWorld.java\`
              2. Compile it using the command: \`javac HelloWorld.java\`
              3. Run it using the command: \`java HelloWorld\`

              This will execute the program and display the "Hello, World!" message on the console."
            `,
                explainPollyError
            )
        }, 30_000)

        it('chat/restore', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.chatResponse:hasCode',
                'cody.codyIgnore:hasFile',
            ]
            // Step 1: create a chat session where I share my name.
            const id1 = await client.request('chat/new', null)
            const reply1 = asTranscriptMessage(
                await client.request('chat/submitMessage', {
                    id: id1,
                    message: {
                        command: 'submit',
                        text: 'My name is Lars Monsen.',
                        submitType: 'user',
                        addEnhancedContext: false,
                    },
                })
            )

            // Step 2: restore a new chat session with a transcript including my name, and
            //  and assert that it can retrieve my name from the transcript.
            const {
                models: [model],
            } = await client.request('chat/models', { modelUsage: ModelUsage.Chat })

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
                `"Your name is Lars Monsen, as you just told me."`,
                explainPollyError
            )
        }, 30_000)

        it('chat/restore (With null model)', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.chatResponse:hasCode',
                'cody.codyIgnore:hasFile',
            ]
            // Step 1: Create a chat session asking what model is used.
            const id1 = await client.request('chat/new', null)
            const reply1 = asTranscriptMessage(
                await client.request('chat/submitMessage', {
                    id: id1,
                    message: {
                        command: 'submit',
                        text: 'What model are you?',
                        submitType: 'user',
                        addEnhancedContext: false,
                    },
                })
            )

            // Step 2: Restoring chat session without model.
            const id2 = await client.request('chat/restore', {
                messages: reply1.messages,
                chatID: new Date().toISOString(), // Create new Chat ID with a different timestamp
            })
            // Step 2: Asking again what model is used
            const reply2 = asTranscriptMessage(
                await client.request('chat/submitMessage', {
                    id: id2,
                    message: {
                        command: 'submit',
                        text: 'What model are you?',
                        submitType: 'user',
                        addEnhancedContext: false,
                    },
                })
            )
            expect(reply2.messages.at(-1)?.text).toMatchInlineSnapshot(
                `"I am Cody, an AI coding assistant created by Sourcegraph. I don't have specific information about my underlying model or architecture. Is there a particular coding task or question I can help you with?"`,
                explainPollyError
            )
        }, 30_000)

        it('chat/restore (multiple) & export', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.chatResponse:hasCode',
                'cody.codyIgnore:hasFile',
            ]
            const date = new Date(1997, 7, 2, 12, 0, 0, 0)

            // Step 1: Restore multiple chats
            const NUMBER_OF_CHATS_TO_RESTORE = 300
            for (let i = 0; i < NUMBER_OF_CHATS_TO_RESTORE; i++) {
                const myDate = new Date(date.getTime() + i * 60 * 1000)
                await client.request('chat/restore', {
                    modelID: 'anthropic/claude-2.0',
                    messages: [
                        { text: 'What model are you?', speaker: 'human', contextFiles: [] },
                        {
                            text: " I'm Claude, an AI assistant created by Anthropic.",
                            speaker: 'assistant',
                        },
                    ],
                    chatID: myDate.toISOString(), // Create new Chat ID with a different timestamp
                })
            }

            // Step 2: export history
            const chatHistory = await client.request('chat/export', null)

            chatHistory.forEach((result, index) => {
                const myDate = new Date(date.getTime() + index * 60 * 1000).toISOString()

                expect(result.transcript).toMatchInlineSnapshot(`{
  "chatModel": "anthropic/claude-2.0",
  "id": "${myDate}",
  "interactions": [
    {
      "assistantMessage": {
        "model": "anthropic/claude-2.0",
        "speaker": "assistant",
        "text": " I'm Claude, an AI assistant created by Anthropic.",
      },
      "humanMessage": {
        "contextFiles": [],
        "speaker": "human",
        "text": "What model are you?",
      },
    },
  ],
  "lastInteractionTimestamp": "${myDate}",
}`)
            })
        }, 30_000)

        it('chat/submitMessage (with enhanced context)', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.chatResponse:hasCode',
                'cody.codyIgnore:hasFile',
            ]
            await client.openFile(animalUri)
            const lastMessage = await client.sendSingleMessageToNewChat(
                'Write a class Dog that implements the Animal interface in my workspace. Show the code only, no explanation needed.',
                {
                    addEnhancedContext: false,
                    contextFiles: mockEnhancedContext,
                }
            )
            // TODO: make this test return a TypeScript implementation of
            // `animal.ts`. It currently doesn't do this because the workspace root
            // is not a git directory and symf reports some git-related error.
            expect(trimEndOfLine(lastMessage?.text ?? '')).toMatchInlineSnapshot(
                `
              "Certainly! Here's a Dog class that implements the Animal interface:

              \`\`\`typescript
              export class Dog implements Animal {
                  name: string;
                  isMammal: boolean = true;

                  constructor(name: string) {
                      this.name = name;
                  }

                  makeAnimalSound(): string {
                      return "Woof!";
                  }
              }
              \`\`\`

              This class fully implements the Animal interface as defined in your workspace."
            `,
                explainPollyError
            )
        }, 30_000)

        it('chat/submitMessage (with enhanced context, squirrel test)', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.chatResponse:hasCode',
                'cody.codyIgnore:hasFile',
            ]
            await client.openFile(squirrelUri)
            const { lastMessage, transcript } =
                await client.sendSingleMessageToNewChatWithFullTranscript('What is Squirrel?', {
                    addEnhancedContext: false,
                    contextFiles: mockEnhancedContext,
                })
            expect(lastMessage?.text?.toLocaleLowerCase() ?? '').includes('code nav')
            expect(lastMessage?.text?.toLocaleLowerCase() ?? '').includes('sourcegraph')
            decodeURIs(transcript)
            const contextFiles = transcript.messages.flatMap(m => m.contextFiles ?? [])
            expect(contextFiles).not.toHaveLength(0)
            expect(contextFiles.map(file => file.uri.toString())).includes(squirrelUri.toString())
        }, 30_000)

        it('webview/receiveMessage (type: chatModel)', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.chatResponse:hasCode',
                'cody.codyIgnore:hasFile',
            ]
            const id = await client.request('chat/new', null)
            {
                await client.setChatModel(id, 'openai/gpt-3.5-turbo')
                const lastMessage = await client.sendMessage(id, 'what color is the sky?')
                expect(lastMessage?.text?.toLocaleLowerCase().includes('blue')).toBeTruthy()
            }
        }, 30_000)

        it('webview/receiveMessage (type: reset)', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.chatResponse:hasCode',
                'cody.codyIgnore:hasFile',
            ]
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

        describe('chat/editMessage', () => {
            it(
                'edits the last human chat message',
                async () => {
                    expectedEvents = [
                        'cody.auth:failed',
                        'cody.auth.login:firstEver',
                        'cody.auth:connected',
                        'cody.chat-question:submitted',
                        'cody.chat-question:executed',
                        'cody.chatResponse:noCode',
                        'cody.chatResponse:hasCode',
                        'cody.editChatButton:clicked',
                        'cody.codyIgnore:hasFile',
                    ]
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
                // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
                expectedEvents = [
                    'cody.auth:failed',
                    'cody.auth.login:firstEver',
                    'cody.auth:connected',
                    'cody.chat-question:submitted',
                    'cody.chat-question:executed',
                    'cody.chatResponse:noCode',
                    'cody.chatResponse:hasCode',
                    'cody.editChatButton:clicked',
                    'cody.codyIgnore:hasFile',
                ]
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

    // TODO(dpc): Integrate file-based .cody/ignore with ignore/test
    describe.skip('Cody Ignore', () => {
        beforeAll(async () => {
            // Make sure Cody ignore config exists and works
            const codyIgnoreConfig = workspace.file('.cody', 'ignore')
            await client.openFile(codyIgnoreConfig)
            const codyIgnoreConfigFile = client.workspace.getDocument(codyIgnoreConfig)
            expect(codyIgnoreConfigFile?.content).toBeDefined()

            const result = await client.request('ignore/test', {
                uri: ignoredUri.toString(),
            })
            expect(result.policy).toBe('ignore')
        }, 10_000)

        it('autocomplete/execute on ignored file', async () => {
            await client.openFile(ignoredUri)
            const completions = await client.request('autocomplete/execute', {
                uri: ignoredUri.toString(),
                position: { line: 1, character: 3 },
                triggerKind: 'Invoke',
            })
            const texts = completions.items.map(item => item.insertText)
            expect(completions.items.length).toBe(0)
            expect(texts).toMatchInlineSnapshot(
                `
              []
            `
            )
        }, 10_000)

        it('chat/submitMessage on an ignored file (with enhanced context)', async () => {
            await client.openFile(ignoredUri)
            const { transcript } = await client.sendSingleMessageToNewChatWithFullTranscript(
                'What files contain SELECTION_START?',
                { addEnhancedContext: false, contextFiles: mockEnhancedContext }
            )
            decodeURIs(transcript)
            const contextFiles = transcript.messages.flatMap(m => m.contextFiles ?? [])
            // Current file which is ignored, should not be included in context files
            expect(contextFiles.find(f => f.uri.toString() === ignoredUri.toString())).toBeUndefined()
            // Ignored file should not be included in context files
            const contextFilesUrls = contextFiles.map(f => f.uri).filter(uri => uri)
            const result = await Promise.all(
                contextFilesUrls.map(uri => client.request('ignore/test', { uri: uri.toString() }))
            )
            for (const r of result) {
                expect(r.policy).toBe('use')
            }
            // Files that are not ignored should be used as context files
            expect(contextFiles.length).toBeGreaterThan(0)
        }, 30_000)

        it('chat/submitMessage on an ignored file (addEnhancedContext: false)', async () => {
            await client.openFile(ignoredUri)
            const { transcript } = await client.sendSingleMessageToNewChatWithFullTranscript(
                'Which file is the isIgnoredByCody functions defined?',
                { addEnhancedContext: false }
            )
            decodeURIs(transcript)
            const contextFiles = transcript.messages.flatMap(m => m.contextFiles ?? [])
            const contextUrls = contextFiles.map(f => f.uri?.path)
            // Current file which is ignored, should not be included in context files
            expect(contextUrls.find(uri => uri === ignoredUri.toString())).toBeUndefined()
            // Since no enhanced context is requested, no context files should be included
            expect(contextFiles.length).toBe(0)
            // Ignored file should not be included in context files
            const result = await Promise.all(
                contextUrls.map(uri =>
                    client.request('ignore/test', {
                        uri,
                    })
                )
            )
            expect(result.every(entry => entry.policy === 'use')).toBe(true)
        }, 30_000)

        it('chat command on an ignored file', async () => {
            await client.openFile(ignoredUri)
            // Cannot execute commands in an ignored files, so this should throw error
            await client.request('commands/explain', null).catch(err => {
                expect(err).toBeDefined()
            })
        }, 30_000)

        it('inline edit on an ignored file', async () => {
            await client.openFile(ignoredUri, { removeCursor: false })
            await client.request('editCommands/document', null).catch(err => {
                expect(err).toBeDefined()
            })
        })

        it('ignore rule is not case sensitive', async () => {
            const alsoIgnored = workspace.file('src', 'is_ignored.ts')
            const result = await client.request('ignore/test', {
                uri: URI.file(alsoIgnored.fsPath).toString(),
            })
            expect(result.policy).toBe('ignore')
        })

        afterAll(async () => {
            // Makes sure cody ignore is still active after tests
            // as it should stay active for each workspace session.
            const result = await client.request('ignore/test', {
                uri: ignoredUri.toString(),
            })
            expect(result.policy).toBe('ignore')

            // Check the network requests to ensure no requests include context from ignored files
            const { requests } = await client.request('testing/networkRequests', null)

            const groupedMsgs = []
            for (const req of requests) {
                // Get the messages from the request body
                const messages = JSON.parse(req.body || '{}')?.messages as {
                    speaker: string
                    text: string
                }[]
                // Filter out messages that do not include context snippets.
                const text = messages
                    ?.filter(m => m.speaker === 'human' && m.text !== undefined)
                    ?.map(m => m.text)

                groupedMsgs.push(...(text ?? []))
            }
            expect(groupedMsgs.length).toBeGreaterThan(0)

            // Join all the string from each groupedMsgs[] together into
            // one block of text, and then check if it contains the ignored file name
            // to confirm context from the ignored file was not sent to the server.
            const groupedText = groupedMsgs.flat().join(' ')
            expect(groupedText).not.includes('src/isIgnored.ts')

            // Confirm the grouped text is valid by checking for known
            // context file names from the test.
            expect(groupedText).includes('src/squirrel.ts')
        }, 10_000)
    })

    describe('Text documents', () => {
        it('chat/submitMessage (understands the selected text)', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.chatResponse:hasCode',
                'cody.editChatButton:clicked',
                'cody.codyIgnore:hasFile',
            ]
            await client.openFile(multipleSelectionsUri)
            await client.changeFile(multipleSelectionsUri)
            await client.changeFile(multipleSelectionsUri, {
                selectionName: 'SELECTION_2',
            })
            const reply = await client.sendSingleMessageToNewChat(
                'What is the name of the function that I have selected? Only answer with the name of the function, nothing else',
                // Add context to ensure the LLM can distinguish between the selected code and other context items
                { addEnhancedContext: false, contextFiles: mockEnhancedContext }
            )
            expect(reply?.text?.trim()).includes('anotherFunction')
            expect(reply?.text?.trim()).not.includes('inner')
            await client.changeFile(multipleSelectionsUri)
            const reply2 = await client.sendSingleMessageToNewChat(
                'What is the name of the function that I have selected? Only answer with the name of the function, nothing else',
                // Add context to ensure the LLM can distinguish between the selected code and other context items
                { addEnhancedContext: false, contextFiles: mockEnhancedContext }
            )
            expect(reply2?.text?.trim()).includes('inner')
            expect(reply2?.text?.trim()).not.includes('anotherFunction')
        }, 20_000)
    })

    describe('Commands', () => {
        it('commands/explain', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.chatResponse:hasCode',
                'cody.editChatButton:clicked',
                'cody.command.explain:executed',
                'cody.codyIgnore:hasFile',
            ]
            await client.openFile(animalUri)
            const freshChatID = await client.request('chat/new', null)
            const id = await client.request('commands/explain', null)

            // Assert that the server is not using IDs between `chat/new` and
            // `chat/explain`. In VS Code, we try to reuse empty webview panels,
            // which is undesireable for agent clients.
            expect(id).not.toStrictEqual(freshChatID)

            const lastMessage = await client.firstNonEmptyTranscript(id)
            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `
              "Sure, I'd be happy to explain.

              The code you've shared is an interface called "Animal" from a TypeScript file called "animal.ts". An interface is like a blueprint for objects that defines what properties and methods an object should have. In this case, the Animal interface defines an object with three properties: "name", "makeAnimalSound", and "isMammal".

              1. The purpose of the code is to define the structure of an object that represents a generic animal in a program. The Animal interface specifies that any object that claims to be an animal should have a name, a method for making an animal sound, and a boolean property that indicates if the animal is a mammal.
              2. The interface doesn't take any inputs, as it only defines a structure. The inputs and outputs are defined by the objects that will implement this interface.
              3. Again, the interface itself doesn't produce any outputs, but it enables the creation of objects that have a specific structure, which is useful for defining and enforcing consistency and expectations in your code.
              4. The interface achieves its purpose by specifying the Required properties and methods that an object needs to have. The code states that the Animal interface must have a "name" property of type string, a "makeAnimalSound" method that returns a string, and an "isMammal" property of type boolean.
              5. The important logic flows or data transformations in this code are the definitions of the "makeAnimalSound" method and the "isMammal" property. These are not defined in the code you shared, but they are required to be implemented by whatever object uses this Animal interface. The "makeAnimalSound" method is expected to produce a sound that an animal makes, and the "isMammal" property is expected to be a boolean value that indicates whether the animal is a mammal. By requiring the implementation of these methods and properties, the Animal interface enables the creation of consistent, predictable animal objects in your code.

              In summary, the Animal interface is a blueprint for animal objects that defines what properties and methods they should have, ensuring consistency and predictability. It doesn't take any inputs or produce any outputs, but it enables the creation of objects that have a specific structure."
            `,
                explainPollyError
            )
        }, 30_000)

        // This test seems extra sensitive on Node v16 for some reason.
        it.skipIf(isWindows())(
            'commands/test',
            async () => {
                // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
                expectedEvents = [
                    'cody.auth:failed',
                    'cody.auth.login:firstEver',
                    'cody.auth:connected',
                    'cody.command.test:executed',
                    'cody.command.explain:executed',
                    'cody.chat-question:executed',
                    'cody.chatResponse:noCode',
                    'cody.chatResponse:hasCode',
                    'cody.editChatButton:clicked',
                    'cody.codyIgnore:hasFile',
                ]
                await client.openFile(animalUri)
                const id = await client.request('commands/test', null)
                const lastMessage = await client.firstNonEmptyTranscript(id)
                expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                    `
                  "Based on the provided code context, it appears that the test framework being used is \`vitest\` for the \`src/example.test.ts\` file. Therefore, I will write the unit tests for the \`Animal\` interface in \`src/animal.ts\` using \`vitest\`.

                  Since the \`Animal\` interface is just a type definition and doesn't have any implementations, I will create a dummy class that implements this interface and write tests for that class.

                  Here is the full code for the new unit tests:
                  \`\`\`typescript
                  import { expect, test } from 'vitest'
                  import { Animal } from '../src/animal'

                  class Dog implements Animal {
                      name: string = 'Dog'
                      isMammal: boolean = true
                      makeAnimalSound(): string {
                          return 'Woof!'
                      }
                  }

                  test('Test animal implementation makes correct sound', () => {
                      const dog = new Dog()
                      expect(dog.makeAnimalSound()).toEqual('Woof!')
                  })

                  test('Test animal implementation isMammal flag', () => {
                      const dog = new Dog()
                      expect(dog.isMammal).toBe(true)
                  })

                  test('Test animal implementation name property', () => {
                      const dog = new Dog()
                      expect(dog.name).toEqual('Dog')
                  })
                  \`\`\`
                  These tests cover the following cases:

                  * The implemented \`makeAnimalSound\` function returns the correct value.
                  * The \`isMammal\` flag is set to \`true\`.
                  * The \`name\` property is set to the correct value.

                  Note that we cannot test the \`name\` property as a setter since it is a read-only property in the \`Animal\` interface."
                `,
                    explainPollyError
                )
            },
            30_000
        )

        it('commands/smell', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.command.explain:executed',
                'cody.command.smell:executed',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
            ]
            await client.openFile(animalUri)
            const id = await client.request('commands/smell', null)
            const lastMessage = await client.firstNonEmptyTranscript(id)

            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `
              "Based on the examination of your TypeScript code at \`src/animal.ts:1-6\`, I found some potential improvements:

              1. Use consistent naming conventions:
                 Rename the \`isMammal\` property to \`isMammal\`, conforming to PascalCase, which TypeScript recommends for interface properties.

                 Benefit: Improves readability and consistency in the codebase.

              2. Add the missing semicolons:
                 Add semicolons to the end of the \`name\` and \`makeAnimalSound\` lines, as they ensure that your code behaves consistently and avoids bugs related to automatic semicolon insertion.

                 Benefit: Ensures predictability and robustness in code execution.

              3. Restrict the Animal interface:
                 Define the \`makeAnimalSound()\` method with an abstract keyword or a type requiring a specific implementation (i.e., a function or a class).

                 Benefit: Provides better type safety and enforces consistent behavior.

              4. Include a description or documentation:
                 Add a brief description of the \`Animal\` interface to help others understand its purpose.

                 Benefit: Improves maintainability and readability for other developers.

              5. Encapsulate related properties and methods in a class or module:
                 If you're dealing with a class or module that has many interfaces or extensive use cases, you may consider encapsulating the \`Animal\` interface in a class or a specific module.

                 Benefit: Enhances encapsulation and modularization, also making your code more manageable.

              ---

              In summary, the provided code adheres to fundamental design principles, but can be improved in specific areas for better readability, maintainability, and alignment with best practices in TypeScript. Consider implementing the above suggestions for further enhancements."
            `,
                explainPollyError
            )
        }, 30_000)
    })

    describe('Progress bars', () => {
        it('progress/report', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.codyIgnore:hasFile',
                'cody.editChatButton:clicked',
                'cody.command.explain:executed',
                'cody.command.smell:executed',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
            ]
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
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.editChatButton:clicked',
                'cody.command.explain:executed',
                'cody.command.smell:executed',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
            ]
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
        const rateLimitedClient = TestClient.create({
            workspaceRootUri: workspace.rootUri,
            name: 'rateLimitedClient',
            credentials: TESTING_CREDENTIALS.dotcomProUserRateLimited,
        })
        // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
        beforeAll(async () => {
            const serverInfo = await rateLimitedClient.initialize()

            expect(serverInfo.authStatus?.isLoggedIn).toBeTruthy()
            expect(serverInfo.authStatus?.username).toStrictEqual('sourcegraphcodyclients-1-efapb')
        }, 10_000)

        // Skipped because Polly is failing to record the HTTP rate-limit error
        // response. Keeping the code around in case we need to debug these in
        // the future. Use the following command to run this test:
        // - First, mark this test as `it.only`
        // - Next, run `CODY_RECORDING_MODE=passthrough pnpm test agent/src/index.test.ts`
        it.skip('chat/submitMessage (RateLimitError)', async () => {
            const lastMessage = await rateLimitedClient.sendSingleMessageToNewChat('sqrt(9)')
            // Intentionally not a snapshot assertion because we should never
            // automatically update 'RateLimitError' to become another value.
            expect(lastMessage?.error?.name).toStrictEqual('RateLimitError')
        }, 30_000)

        // Skipped because Polly is failing to record the HTTP rate-limit error
        // response. Keeping the code around in case we need to debug these in
        // the future. Use the following command to run this test:
        // - First, mark this test as `it.only`
        // - Next, run `CODY_RECORDING_MODE=passthrough pnpm test agent/src/index.test.ts`
        it.skip('autocomplete/trigger (RateLimitError)', async () => {
            let code = 0
            try {
                await rateLimitedClient.openFile(sumUri)
                const result = await rateLimitedClient.autocompleteText()
                console.log({ result })
            } catch (error) {
                if (error instanceof ResponseError) {
                    code = error.code
                }
            }
            expect(code).toEqual(CodyJsonRpcErrorCode.RateLimitError)
        }, 30_000)
        afterAll(async () => {
            await rateLimitedClient.shutdownAndExit()
            // Long timeout because to allow Polly.js to persist HTTP recordings
        }, 30_000)
    })

    describe('Enterprise', () => {
        const demoEnterpriseClient = TestClient.create({
            workspaceRootUri: workspace.rootUri,
            name: 'enterpriseClient',
            credentials: TESTING_CREDENTIALS.enterprise,
            logEventMode: 'connected-instance-only',
        })
        // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
        beforeAll(async () => {
            const serverInfo = await demoEnterpriseClient.initialize()

            expect(serverInfo.authStatus?.isLoggedIn).toBeTruthy()
            expect(serverInfo.authStatus?.username).toStrictEqual('codytesting')
        }, 10_000)

        it('chat/submitMessage', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.editChatButton:clicked',
                'cody.command.explain:executed',
                'cody.command.smell:executed',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
            ]
            const lastMessage = await demoEnterpriseClient.sendSingleMessageToNewChat('Reply with "Yes"')
            expect(lastMessage?.text?.trim()).toStrictEqual('Yes')
        }, 20_000)

        // Skip because it consistently fails with:
        // Error: Test timed out in 20000ms.
        it.skip('commands/document (enterprise client)', async () => {
            const uri = workspace.file('src', 'example.test.ts')
            const obtained = await demoEnterpriseClient.documentCode(uri)
            expect(obtained).toMatchInlineSnapshot(
                `
              "import { expect } from 'vitest'
              import { it } from 'vitest'
              import { describe } from 'vitest'

              describe('test block', () => {
                  it('does 1', () => {
                      expect(true).toBe(true)
                  })

                  it('does 2', () => {
                      expect(true).toBe(true)
                  })

                  it('does something else', () => {
                      // This line will error due to incorrect usage of \`performance.now\`
                      // Record the start time of the test using the Performance API
                      const startTime = performance.now(/* CURSOR */)
                  })
              })
              "
            `
            )
        }, 20_000)

        it('remoteRepo/list', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.editChatButton:clicked',
                'cody.command.explain:executed',
                'cody.command.smell:executed',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
            ]
            // List a repo without a query
            let repos: Requests['remoteRepo/list'][1]
            do {
                repos = await demoEnterpriseClient.request('remoteRepo/list', {
                    query: undefined,
                    first: 10,
                })
            } while (repos.state.state === 'fetching')
            expect(repos.repos).toHaveLength(10)

            // Make a paginated query.
            const secondLastRepo = repos.repos.at(-2)
            const moreRepos = await demoEnterpriseClient.request('remoteRepo/list', {
                query: undefined,
                first: 2,
                afterId: secondLastRepo?.id,
            })
            expect(moreRepos.repos[0].id).toBe(repos.repos.at(-1)?.id)

            // Make a query.
            const filteredRepos = await demoEnterpriseClient.request('remoteRepo/list', {
                query: 'sourceco',
                first: 1000,
            })
            expect(
                filteredRepos.repos.find(repo => repo.name === 'github.com/sourcegraph/cody')
            ).toBeDefined()
        })

        it('remoteRepo/has', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.editChatButton:clicked',
                'cody.command.explain:executed',
                'cody.command.smell:executed',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
            ]
            // Query a repo that does exist.
            const codyRepoExists = await demoEnterpriseClient.request('remoteRepo/has', {
                repoName: 'github.com/sourcegraph/cody',
            })
            expect(codyRepoExists.result).toBe(true)

            // Query a repo that does not exist.
            const codyForDos = await demoEnterpriseClient.request('remoteRepo/has', {
                repoName: 'github.com/sourcegraph/cody-edlin',
            })
            expect(codyForDos.result).toBe(false)
        })

        afterAll(async () => {
            const { requests } = await demoEnterpriseClient.request('testing/networkRequests', null)
            const nonServerInstanceRequests = requests
                .filter(({ url }) => !url.startsWith(demoEnterpriseClient.serverEndpoint))
                .map(({ url }) => url)
            expect(JSON.stringify(nonServerInstanceRequests)).toStrictEqual('[]')
            await demoEnterpriseClient.shutdownAndExit()

            // Long timeout because to allow Polly.js to persist HTTP recordings
        }, 30_000)
    })

    // Enterprise tests are run at demo instance, which is at a recent release version.
    // Use this section if you need to run against S2 which is released continuously.
    describe('Enterprise - close main branch', () => {
        const s2EnterpriseClient = TestClient.create({
            workspaceRootUri: workspace.rootUri,
            name: 'enterpriseMainBranchClient',
            credentials: TESTING_CREDENTIALS.s2,
            logEventMode: 'connected-instance-only',
        })

        // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
        beforeAll(async () => {
            const serverInfo = await s2EnterpriseClient.initialize({
                autocompleteAdvancedProvider: 'fireworks',
            })

            expect(serverInfo.authStatus?.isLoggedIn).toBeTruthy()
            expect(serverInfo.authStatus?.username).toStrictEqual('codytesting')
        }, 10_000)

        // Disabled because `attribution/search` GraphQL does not work on S2
        // See https://sourcegraph.slack.com/archives/C05JDP433DL/p1714017586160079
        it.skip('attribution/found', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            expectedEvents = [
                'cody.auth:failed',
                'cody.auth.login:firstEver',
                'cody.auth:connected',
                'cody.ghostText:visible',
                'cody.codyIgnore:hasFile',
                'cody.editChatButton:clicked',
                'cody.command.explain:executed',
                'cody.command.test:executed',
                'cody.command.smell:executed',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
            ]
            const id = await s2EnterpriseClient.request('chat/new', null)
            const { repoNames, error } = await s2EnterpriseClient.request('attribution/search', {
                id,
                snippet: 'sourcegraph.Location(new URL',
            })
            expect(repoNames).not.empty
            expect(error).null
        }, 20_000)

        it('attribution/not found', async () => {
            const id = await s2EnterpriseClient.request('chat/new', null)
            const { repoNames, error } = await s2EnterpriseClient.request('attribution/search', {
                id,
                snippet: 'sourcegraph.Location(new LRU',
            })
            expect(repoNames).empty
            expect(error).null
        }, 20_000)

        // Use S2 instance for Cody Context Filters enterprise tests
        describe('Cody Context Filters for enterprise', () => {
            it('testing/ignore/overridePolicy', async () => {
                // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
                expectedEvents = [
                    'cody.auth:failed',
                    'cody.auth.login:firstEver',
                    'cody.auth:connected',
                    'cody.editChatButton:clicked',
                    'cody.command.explain:executed',
                    'cody.command.smell:executed',
                    'cody.chat-question:executed',
                    'cody.chatResponse:noCode',
                ]
                const onChangeCallback = vi.fn()

                // `sumUri` is located inside of the github.com/sourcegraph/cody repo.
                const ignoreTest = () =>
                    s2EnterpriseClient.request('ignore/test', { uri: sumUri.toString() })
                s2EnterpriseClient.registerNotification('ignore/didChange', onChangeCallback)

                expect(await ignoreTest()).toStrictEqual({ policy: 'use' })

                await s2EnterpriseClient.request('testing/ignore/overridePolicy', {
                    include: [{ repoNamePattern: '' }],
                    exclude: [{ repoNamePattern: '.*sourcegraph/cody.*' }],
                })

                expect(onChangeCallback).toBeCalledTimes(1)
                expect(await ignoreTest()).toStrictEqual({ policy: 'ignore' })

                await s2EnterpriseClient.request('testing/ignore/overridePolicy', {
                    include: [{ repoNamePattern: '' }],
                    exclude: [{ repoNamePattern: '.*sourcegraph/sourcegraph.*' }],
                })

                expect(onChangeCallback).toBeCalledTimes(2)
                expect(await ignoreTest()).toStrictEqual({ policy: 'use' })

                await s2EnterpriseClient.request('testing/ignore/overridePolicy', {
                    include: [{ repoNamePattern: '' }],
                    exclude: [{ repoNamePattern: '.*sourcegraph/sourcegraph.*' }],
                })

                // onChangeCallback is not called again because filters are the same
                expect(onChangeCallback).toBeCalledTimes(2)
            })

            // The site config `cody.contextFilters` value on sourcegraph.sourcegraph.com instance
            // should include `sourcegraph/cody` repo for this test to pass.
            // Skipped because of the API error:
            //  Request to https://sourcegraph.sourcegraph.com/.api/completions/code?client-name=vscode&client-version=v1 failed with 406 Not Acceptable: ClientCodyIgnoreCompatibilityError: Cody for vscode version "v1" doesn't match version constraint ">= 1.20.0". Please upgrade your client.
            // https://linear.app/sourcegraph/issue/CODY-2814/fix-and-re-enable-cody-context-filters-agent-integration-test
            it.skip('autocomplete/execute (with Cody Ignore filters)', async () => {
                // Documents to be used as context sources.
                await s2EnterpriseClient.openFile(animalUri)
                await s2EnterpriseClient.openFile(squirrelUri)

                // Document to generate a completion from.
                await s2EnterpriseClient.openFile(sumUri)

                const { items, completionEvent } = await s2EnterpriseClient.request(
                    'autocomplete/execute',
                    {
                        uri: sumUri.toString(),
                        position: { line: 1, character: 3 },
                        triggerKind: 'Invoke',
                    }
                )

                expect(items.length).toBeGreaterThan(0)
                expect(items.map(item => item.insertText)).toMatchInlineSnapshot(
                    `
              [
                "   return a + b",
              ]
            `
                )

                // Two documents will be checked against context filters set in site-config on S2.
                expect(
                    completionEvent?.params.contextSummary?.retrieverStats['jaccard-similarity']
                        .suggestedItems
                ).toEqual(2)

                s2EnterpriseClient.notify('autocomplete/completionAccepted', {
                    completionID: items[0].id,
                })
            }, 10_000)
        })

        afterAll(async () => {
            await s2EnterpriseClient.shutdownAndExit()
            // Long timeout because to allow Polly.js to persist HTTP recordings
        }, 30_000)
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.shutdownAndExit()
        // Long timeout because to allow Polly.js to persist HTTP recordings
    }, 30_000)
})
