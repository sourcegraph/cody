import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
    type ContextItem,
    ContextItemSource,
    DOTCOM_URL,
    ModelUsage,
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
import { trimEndOfLine } from './trimEndOfLine'
const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))

const mayRecord =
    process.env.CODY_RECORDING_MODE === 'record' || process.env.CODY_RECORD_IF_MISSING === 'true'

describe('Agent', () => {
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'defaultClient',
        credentials: TESTING_CREDENTIALS.dotcom,
    })

    const rateLimitedClient = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'rateLimitedClient',
        credentials: TESTING_CREDENTIALS.dotcomProUserRateLimited,
    })

    const mockEnhancedContext: ContextItem[] = []

    // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
    beforeAll(async () => {
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
    })

    afterEach(async () => {
        // declare enterprise client
        let currentClient: TestClient
        const testName = expect.getState().currentTestName ?? 'NoTestName'
        // Choose client based on test name
        if (testName.includes('RateLimitedAgent')) {
            currentClient = rateLimitedClient
        } else {
            currentClient = client // Default client
        }

        const response = await currentClient.request('testing/exportedTelemetryEvents', null)

        // send data to testing pub/sub topic
        // for each request in response, send to logtest
        const testRunId = uuid.v4()
        for (const event of response.events) {
            // Assuming logTestingData is defined elsewhere in the codebase
            logTestingData(
                JSON.stringify(event),
                'v2-agent-e2e',
                expect.getState().currentTestName,
                testRunId
            )
        }
        // Equality check to ensure all expected events(feature:action) were fired
        const loggedTelemetryEventsV2 = response.events.map(event => `${event.feature}:${event.action}`)
        expect(loggedTelemetryEventsV2).toEqual(expect.arrayContaining(currentClient.expectedEvents))
    })

    const sumUri = workspace.file('src', 'sum.ts')
    const animalUri = workspace.file('src', 'animal.ts')
    const squirrelUri = workspace.file('src', 'squirrel.ts')
    const multipleSelectionsUri = workspace.file('src', 'multiple-selections.ts')

    // Context files ends with 'Ignored.ts' will be excluded by .cody/ignore
    const ignoredUri = workspace.file('src', 'isIgnored.ts')

    it('extensionConfiguration/change & chat/models (handle errors)', async () => {
        // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
        client.expectedEvents = [
            'cody.auth:failed',
            'cody.auth:connected',
            'cody.auth.login:firstEver',
            'cody.interactiveTutorial:attemptingStart',
            'cody.experiment.interactiveTutorial:enrolled',
        ]
        // Send two config change notifications because this is what the
        // JetBrains client does and there was a bug where everything worked
        // fine as long as we didn't send the second unauthenticated config
        // change.
        const initModelName = 'anthropic/claude-3-5-sonnet-20240620'
        const {
            models: [initModel],
        } = await client.request('chat/models', { modelUsage: ModelUsage.Chat })
        expect(initModel.id).toStrictEqual(initModelName)

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
        const remoteInvalidModels = invalidModels.models.filter(model => model.provider !== 'Ollama')
        expect(remoteInvalidModels).toStrictEqual([])

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
        expect(reauthenticatedModels.models[0].id).toStrictEqual(initModelName)

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
        client.expectedEvents = []
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
            client.expectedEvents = [
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
            ]
            const lastMessage = await client.sendSingleMessageToNewChat('Hello!')
            expect(lastMessage).toMatchInlineSnapshot(
                `
              {
                "model": "anthropic/claude-3-5-sonnet-20240620",
                "speaker": "assistant",
                "text": "Hello! I'm Cody, an AI coding assistant from Sourcegraph. How can I help you with your coding tasks today? Whether you need assistance with writing code, debugging, explaining concepts, or anything else related to programming, I'm here to help. What would you like to work on?",
              }
            `
            )
        }, 30_000)

        it('chat/submitMessage (long message)', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            client.expectedEvents = [
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:hasCode',
            ]
            const lastMessage = await client.sendSingleMessageToNewChat(
                'Generate simple hello world function in java!'
            )
            const trimmedMessage = trimEndOfLine(lastMessage?.text ?? '')
            expect(trimmedMessage).toMatchInlineSnapshot(
                `
              "Certainly! I'll create a simple "Hello, World!" function in Java for you. Here's the code:

              \`\`\`java:HelloWorld.java
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
              3. We also have a separate \`sayHello\` method that prints "Hello, World!" to the console.
              4. In the \`main\` method, we call the \`sayHello\` method.

              To run this program:

              1. Save the code in a file named \`HelloWorld.java\`.
              2. Compile the code using the command: \`javac HelloWorld.java\`
              3. Run the compiled program using: \`java HelloWorld\`

              When you run this program, it will output:

              \`\`\`
              Hello, World!
              \`\`\`

              This is a simple example of a Java function that prints a greeting to the console."
            `,
                explainPollyError
            )
        }, 30_000)

        it('chat/restore', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            client.expectedEvents = [
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
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
                modelID: model.id,
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
                `"Your name is Lars Monsen, as you mentioned in your introduction."`,
                explainPollyError
            )
        }, 30_000)

        it('chat/restore (With null model)', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            client.expectedEvents = [
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
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
                `"I apologize for any confusion, but I don't have specific information about my exact model architecture or training. I am an AI assistant called Cody, created by Sourcegraph, designed to help with coding and software development tasks. I don't have a specific model name like GPT-3 or BERT. My capabilities come from my training, but the details of that training process aren't something I have access to or can share. If you have any coding or development questions, I'd be happy to assist with those!"`,
                explainPollyError
            )
        }, 30_000)

        it('chat/restore (multiple) & export', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            client.expectedEvents = []
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
                            model: 'anthropic/claude-2.0',
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

        it('chat/submitMessage (with mock context)', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            client.expectedEvents = [
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:hasCode',
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
              "Certainly! Here's a class \`Dog\` that implements the \`Animal\` interface:

              \`\`\`typescript:src/dog.ts
              import { Animal } from './animal';

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

              This implementation fulfills all the requirements of the \`Animal\` interface defined in your workspace."
            `,
                explainPollyError
            )
        }, 30_000)

        it('chat/submitMessage (squirrel test)', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            client.expectedEvents = [
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
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
            client.expectedEvents = [
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
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
            client.expectedEvents = [
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
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
                    client.expectedEvents = [
                        'cody.chat-question:submitted',
                        'cody.chat-question:executed',
                        'cody.chatResponse:noCode',
                        'cody.chat-question:submitted',
                        'cody.chat-question:executed',
                        'cody.editChatButton:clicked',
                        'cody.chatResponse:noCode',
                        'cody.editChatButton:clicked',
                        'cody.chat-question:submitted',
                        'cody.chat-question:executed',
                        'cody.chatResponse:noCode',
                        'cody.chat-question:submitted',
                        'cody.chat-question:executed',
                        'cody.chatResponse:noCode',
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
                client.expectedEvents = [
                    'cody.chat-question:submitted',
                    'cody.chat-question:executed',
                    'cody.chatResponse:noCode',
                    'cody.chat-question:submitted',
                    'cody.chat-question:executed',
                    'cody.chatResponse:noCode',
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

        it('chat/submitMessage on an ignored file', async () => {
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
        // Skipping this test because it asserts an outdated behavior.
        // Previously, the user's selection was added to the context even when
        // `addEnhancedContext: false`. In the PR
        // https://github.com/sourcegraph/cody/pull/5060, we change the behavior
        // so that the user's selection is only added when `addEnhancedContext:
        // true`.  We can't just set `addEnhancedContext: true` because we have
        // other assertions that fail the tests when `addEnhancedContext: true`
        // and symf is disabled. If we remove that assertion, the test still
        // fails because of other reasons. Most likely, the Right solution is to
        // remove the concept of `addEnhancedContext` altogether because the
        // webview-based Chat  UI doesn't even expose a button to control this. We will still
        // need to figure out how we expose adding the user's selection to the
        // context when interacting with Cody through the JSON-RPC API.
        it.skip('chat/submitMessage (understands the selected text)', async () => {
            await client.openFile(multipleSelectionsUri)
            await client.changeFile(multipleSelectionsUri)
            await client.changeFile(multipleSelectionsUri, {
                selectionName: 'SELECTION_2',
            })
            const contextFilesWithoutSelectionFile = mockEnhancedContext.filter(
                item => item.uri.toString() !== multipleSelectionsUri.toString()
            )

            const reply = await client.sendSingleMessageToNewChat(
                'What is the name of the function that I have selected? Only answer with the name of the function, nothing else',
                // Add context to ensure the LLM can distinguish between the selected code and other context items
                {
                    addEnhancedContext: false,
                    contextFiles: [
                        ...contextFilesWithoutSelectionFile,
                        {
                            type: 'file',
                            uri: multipleSelectionsUri,
                            range: {
                                start: {
                                    line: 7,
                                    character: 0,
                                },
                                end: {
                                    line: 8,
                                    character: 0,
                                },
                            },
                            source: ContextItemSource.Selection,
                        },
                    ],
                }
            )
            expect(reply?.text?.trim()).includes('anotherFunction')
            expect(reply?.text?.trim()).not.includes('inner')
            await client.changeFile(multipleSelectionsUri)
            const reply2 = await client.sendSingleMessageToNewChat(
                'What is the name of the function that I have selected? Only answer with the name of the function, nothing else',
                // Add context to ensure the LLM can distinguish between the selected code and other context items
                {
                    addEnhancedContext: false,
                    contextFiles: [
                        ...contextFilesWithoutSelectionFile,
                        {
                            type: 'file',
                            uri: multipleSelectionsUri,
                            source: ContextItemSource.Selection,
                        },
                    ],
                }
            )
            expect(reply2?.text?.trim()).includes('inner')
            expect(reply2?.text?.trim()).not.includes('anotherFunction')
        }, 20_000)
    })

    describe('Commands', () => {
        it('commands/explain', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            client.expectedEvents = [
                'cody.command.explain:executed',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:noCode',
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
              "The code being explained is an interface named \`Animal\` in a TypeScript file at \`src/animal.ts\`.

              The purpose of this code is to define what properties an object should have in order to be considered an \`Animal\`. The interface does this by listing the required properties such as \`name\`, \`makeAnimalSound()\`, and \`isMammal\`. The \`name\` is a required string field, \`isMammal\` is a required boolean field, and \`makeAnimalSound()\` is a required function that returns a string.

              The code doesn't take any input directly, but its purpose is to be implemented by other TypeScript classes defining a specific animal, such as \`Dog\` or \`Cat\`. These classes will then implement the required properties and functions defined in the \`Animal\` interface.

              The output of this code is not a value itself, but rather a description of a data structure. Objects of classes that implement this interface can be used as \`Animal\` type, but the interface itself doesn't produce any value directly.

              The way this is achieved is by using the TypeScript feature called \`interfaces\`, which provides a contract that a class has to follow in order to adhere to the structure defined by the interface. The interface defines what properties are required to be present in classes that implement it.

              The main logic flow is that the interface \`Animal\` is defined with its required properties, and classes that want to be considered as implementing the \`Animal\` interface need to adhere to this structure. The data transformation that happens is that classes that implement the \`Animal\` interface provide the actual implementation and logic for the required properties. The interface only provides the shape that the class should have without implementing it."
            `,
                explainPollyError
            )
        }, 30_000)

        // This test seems extra sensitive on Node v16 for some reason.
        it.skipIf(isWindows())(
            'commands/test',
            async () => {
                // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
                client.expectedEvents = [
                    'cody.command.test:executed',
                    'cody.chat-question:submitted',
                    'cody.chat-question:executed',
                    'cody.chatResponse:hasCode',
                ]
                await client.openFile(animalUri)
                const id = await client.request('commands/test', null)
                const lastMessage = await client.firstNonEmptyTranscript(id)
                expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                    `
                  "Based on the shared code context, the test framework in use is \`vitest\`.

                  To write unit tests for the \`Animal\` interface in \`src/animal.ts\`, we can create instances of classes that implement this interface, and validate their implementation by calling methods and properties against the interface definition.

                  Here's a suite of unit tests for the \`Animal\` interface using \`vitest\`:
                  \`\`\`typescript
                  // src/animal.test.ts
                  import { expect, describe, it } from 'vitest'
                  import { Animal } from '../animal'

                  describe('Animal interface unit tests', () => {
                      it('should define name property', () => {
                          const animal: Animal = {
                              name: 'Lion',
                              makeAnimalSound() {
                                  return 'roar'
                              },
                              isMammal: true,
                          }

                          expect(animal.name).toEqual('Lion')
                      })

                      it('should define makeAnimalSound method', () => {
                          const animal: Animal = {
                              name: 'Dog',
                              makeAnimalSound() {
                                  return 'bark'
                              },
                              isMammal: true,
                          }

                          expect(animal.makeAnimalSound()).toEqual('bark')
                      })

                      it('should define isMammal property', () => {
                          const animal: Animal = {
                              name: 'Cat',
                              makeAnimalSound() {
                                  return 'meow'
                              },
                              isMammal: true,
                          }

                          expect(animal.isMammal).toEqual(true)
                      })

                      it('should throw error if animal does not have name property', () => {
                          const createInvalidAnimal = () => {
                              const animal: Animal = {
                                  makeAnimalSound() {
                                      return 'cry'
                                  },
                                  isMammal: false,
                              }

                              return animal
                          }

                          expect(() => createInvalidAnimal()).toThrowError('Animal must have a name')
                      })

                      it('should throw error if animal does not implement makeAnimalSound method', () => {
                          const createInvalidAnimal = () => {
                              const animal: Animal = {
                                  name: 'Frog',
                                  isMammal: false,
                              }

                              return animal
                          }

                          expect(() => createInvalidAnimal()).toThrowError('Animal must implement makeAnimalSound method')
                      })

                      it('should throw error if animal does not have isMammal property', () => {
                          const createInvalidAnimal = () => {
                              const animal: Animal = {
                                  name: 'Snake',
                                  makeAnimalSound() {
                                      return 'hiss'
                                  },
                              }

                              return animal
                          }

                          expect(() => createInvalidAnimal()).toThrowError('Animal must have isMammal property')
                      })
                  })
                  \`\`\`
                  These tests validate the expected functionality of the \`Animal\` interface, including checking for required properties and methods, and throwing errors when required properties or methods are missing or undefined.

                  Limitations:
                  - These tests only cover the \`Animal\` interface definition, and do not test any actual implementations of the interface.
                  - No mock objects are created in these tests. If future tests require mocking behavior, the appropriate mocking library or framework will need to be added.

                  Note:
                  - The import statements assume the relative path to \`animal.ts\` is at \`../animal\`. If this is not the case, please adjust the import statement accordingly."
                `,
                    explainPollyError
                )
            },
            30_000
        )

        it('commands/smell', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            client.expectedEvents = [
                'cody.command.smell:executed',
                'cody.chat-question:submitted',
                'cody.chat-question:executed',
                'cody.chatResponse:hasCode',
            ]
            await client.openFile(animalUri)
            const id = await client.request('commands/smell', null)
            const lastMessage = await client.firstNonEmptyTranscript(id)

            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `
              "Based on my analysis, I found the following areas for improvement in the provided code:

              1. **Add type annotations for function return types:** By adding return type annotations, we can provide more information to users of our code and ensure that the code behaves as expected. It also improves readability.

              \`\`\`typescript
              makeAnimalSound(): string
              \`\`\`

              2. **Add missing access modifiers for interface members:** By default, interface members are public in TypeScript. However, it's still good practice to be explicit about the intended access modifier.

              \`\`\`typescript
              export interface Animal {
                name: string;
                makeAnimalSound(): string;
                isMammal: boolean;
              }
              \`\`\`

              3. **Use consistent spacing:** Inconsistent spacing can affect the readability of the code.

              \`\`\`typescript
              makeAnimalSound(): string

              // Change to:

              makeAnimalSound(): string;
              \`\`\`

              4. **Avoid naming inconsistencies to improve consistency and readability:**

              \`\`\`typescript
              isMammal: boolean

              // Consider renaming this to isMammal() for consistency with makeAnimalSound().
              \`\`\`

              5. **Consider adding a method that abstracts the sound-making process:** Based on the provided code, making a sound is directly tied to the name of the animal. Adding a separate abstraction for the sound would make it more generic.

              \`\`\`typescript
              createSound(sound: string): string {
                return sound;
              }

              // Then we can call createSound(this.name) inside makeAnimalSound().
              \`\`\`

              In summary, the provided code is a good starting point and fairly well written. However, introducing these best practices would help improve consistency, readability, and maintainability."
            `,
                explainPollyError
            )
        }, 30_000)
    })

    describe('Progress bars', () => {
        it('progress/report', async () => {
            // list of v2 events we expect to fire during the test run (feature:action). Add to this list as needed.
            client.expectedEvents = []
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
            client.expectedEvents = []
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

    afterAll(async () => {
        await workspace.afterAll()
        await client.shutdownAndExit()
        // Long timeout because to allow Polly.js to persist HTTP recordings
    }, 30_000)
})
