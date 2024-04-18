import assert from 'node:assert'
import { execSync } from 'node:child_process'
import fspromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as vscode from 'vscode'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ModelUsage, isWindows } from '@sourcegraph/cody-shared'

import { URI } from 'vscode-uri'
import type { RequestMethodName } from '../../vscode/src/jsonrpc/jsonrpc'
import { TestClient, asTranscriptMessage } from './TestClient'
import { decodeURIs } from './decodeURIs'
import { isNode16 } from './isNode16'
import type {
    CustomChatCommandResult,
    CustomEditCommandResult,
    EditTask,
    Requests,
} from './protocol-alias'

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
const workspaceRootUri = vscode.Uri.file(path.join(os.tmpdir(), 'cody-vscode-shim-test'))
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

    const client = new TestClient({
        name: 'defaultClient',
        // The redacted ID below is copy-pasted from the recording file and
        // needs to be updated whenever we change the underlying access token.
        // We can't return a random string here because then Polly won't be able
        // to associate the HTTP requests between record mode and replay mode.
        accessToken:
            process.env.SRC_ACCESS_TOKEN ??
            'REDACTED_b09f01644a4261b32aa2ee4aea4f279ba69a57cff389f9b119b5265e913c0ea4',
    })

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
        await fspromises.cp(prototypePath, workspaceRootPath, {
            recursive: true,
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
            serverEndpoint: client.info.extensionConfiguration?.serverEndpoint ?? dotcom,
            customHeaders: {},
        })
        expect(valid?.isLoggedIn).toBeTruthy()

        // Confirm .cody/ignore is active at start up
        const ignore = await client.request('ignore/forUri', {
            uri: URI.file(ignoredPath).toString(),
        })
        expect(ignore.policy).toBe('use')
    }, 10_000)

    beforeEach(async () => {
        await client.request('testing/reset', null)
    })

    const sumPath = path.join(workspaceRootPath, 'src', 'sum.ts')
    const sumUri = vscode.Uri.file(sumPath)
    const animalPath = path.join(workspaceRootPath, 'src', 'animal.ts')
    const animalUri = vscode.Uri.file(animalPath)
    const squirrelPath = path.join(workspaceRootPath, 'src', 'squirrel.ts')
    const squirrelUri = vscode.Uri.file(squirrelPath)
    const multipleSelections = path.join(workspaceRootPath, 'src', 'multiple-selections.ts')
    const multipleSelectionsUri = vscode.Uri.file(multipleSelections)

    // Context files ends with 'Ignored.ts' will be excluded by .cody/ignore
    const ignoredPath = path.join(workspaceRootPath, 'src', 'isIgnored.ts')
    const ignoredUri = vscode.Uri.file(ignoredPath)

    it('extensionConfiguration/change (handle errors)', async () => {
        // Send two config change notifications because this is what the
        // JetBrains client does and there was a bug where everything worked
        // fine as long as we didn't send the second unauthenticated config
        // change.
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
        expect(valid?.username).toStrictEqual('sourcegraphbot9k-fnwmu')
    }, 10_000)

    describe('Autocomplete', () => {
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
        `
            )
            client.notify('autocomplete/completionAccepted', {
                completionID: completions.items[0].id,
            })
        }, 10_000)
    })

    it('graphql/getCurrentUserCodySubscription', async () => {
        const currentUserCodySubscription = await client.request(
            'graphql/getCurrentUserCodySubscription',
            null
        )
        expect(currentUserCodySubscription).toMatchInlineSnapshot(`
          {
            "applyProRateLimits": true,
            "currentPeriodEndAt": "2024-04-14T22:11:32Z",
            "currentPeriodStartAt": "2024-03-14T22:11:32Z",
            "plan": "PRO",
            "status": "ACTIVE",
          }
        `)
    }, 10_000)

    describe('Chat', () => {
        it('chat/submitMessage (short message)', async () => {
            const lastMessage = await client.sendSingleMessageToNewChat('Hello!')
            expect(lastMessage).toMatchInlineSnapshot(
                `
              {
                "speaker": "assistant",
                "text": "Hello! I'm Claude, an AI assistant created by Anthropic. It's nice to meet you. How can I help you today?",
              }
            `
            )
        }, 30_000)

        it('chat/submitMessage (long message)', async () => {
            const lastMessage = await client.sendSingleMessageToNewChat(
                'Generate simple hello world function in java!'
            )
            const trimmedMessage = trimEndOfLine(lastMessage?.text ?? '')
            expect(trimmedMessage).toMatchInlineSnapshot(
                `
              "Here's a simple "Hello, World!" function in Java:

              \`\`\`java
              public class HelloWorld {
                  public static void main(String[] args) {
                      System.out.println("Hello, World!");
                  }
              }
              \`\`\`

              To explain:

              1. \`public class HelloWorld\` declares a new public class named \`HelloWorld\`.
              2. \`public static void main(String[] args)\` is the main method that is the entry point of any Java program. It's a \`static\` method, so it can be called without instantiating an object of the class.
              3. \`System.out.println("Hello, World!");\` prints the string \`"Hello, World!"\` to the console.

              To run this program, you need to save it in a file with a \`.java\` extension (e.g., \`HelloWorld.java\`), compile it using a Java compiler, and then run the compiled bytecode.

              If you're using the command line, you can compile and run the program with the following commands:

              \`\`\`
              javac HelloWorld.java
              java HelloWorld
              \`\`\`

              This will print \`Hello, World!\` to the console."
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
                `"You told me your name is Lars Monsen."`,
                explainPollyError
            )
        }, 30_000)

        it('chat/restore (With null model)', async () => {
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
                `"I don't actually have a specific model name or number. I'm an AI created by Anthropic, but I don't know all the details about the type of model or training process that was used to develop me. I apologize that I can't give you a more specific answer on that. Let me know if there are any other questions I can assist with!"`,
                explainPollyError
            )
        }, 30_000)

        it('chat/restore (multiple) & export', async () => {
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

        it('chat/submitMessage (addEnhancedContext: true)', async () => {
            await client.openFile(animalUri)
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
            const lastMessage = await client.sendSingleMessageToNewChat(
                'Write a class Dog that implements the Animal interface in my workspace. Show the code only, no explanation needed.',
                {
                    addEnhancedContext: true,
                }
            )
            // TODO: make this test return a TypeScript implementation of
            // `animal.ts`. It currently doesn't do this because the workspace root
            // is not a git directory and symf reports some git-related error.
            expect(trimEndOfLine(lastMessage?.text ?? '')).toMatchInlineSnapshot(
                `
              "\`\`\`typescript
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

        it('webview/receiveMessage (type: chatModel)', async () => {
            const id = await client.request('chat/new', null)
            {
                await client.setChatModel(id, 'openai/gpt-3.5-turbo')
                const lastMessage = await client.sendMessage(id, 'what color is the sky?')
                expect(lastMessage?.text?.toLocaleLowerCase().includes('blue')).toBeTruthy()
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

    describe('Cody Ignore', () => {
        beforeAll(async () => {
            // Make sure Cody ignore config exists and works
            const codyIgnoreConfig = vscode.Uri.file(path.join(workspaceRootPath, '.cody/ignore'))
            await client.openFile(codyIgnoreConfig)
            const codyIgnoreConfigFile = client.workspace.getDocument(codyIgnoreConfig)
            expect(codyIgnoreConfigFile?.content).toBeDefined()

            const result = await client.request('ignore/forUri', {
                uri: URI.file(ignoredPath).toString(),
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

        it('chat/submitMessage on an ignored file (addEnhancedContext: true)', async () => {
            await client.openFile(ignoredUri)
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
            const { transcript } = await client.sendSingleMessageToNewChatWithFullTranscript(
                'What files contain SELECTION_START?',
                { addEnhancedContext: true }
            )
            decodeURIs(transcript)
            const contextFiles = transcript.messages.flatMap(m => m.contextFiles ?? [])
            // Current file which is ignored, should not be included in context files
            expect(contextFiles.find(f => f.uri.toString() === ignoredUri.toString())).toBeUndefined()
            // Ignored file should not be included in context files
            const contextFilesUrls = contextFiles.map(f => f.uri).filter(uri => uri)
            const result = await Promise.all(
                contextFilesUrls.map(uri => client.request('ignore/forUri', { uri: uri.toString() }))
            )
            for (const r of result) {
                expect(r.policy).toBe('use')
            }
            // Files that are not ignored should be used as context files
            expect(contextFiles.length).toBeGreaterThan(0)
        }, 30_000)

        it('chat/submitMessage on an ignored file (addEnhancedContext: false)', async () => {
            await client.openFile(ignoredUri)
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
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
                    client.request('ignore/forUri', {
                        uri,
                    })
                )
            )
            expect(result.every(entry => entry.policy === 'use')).toBe(true)
        }, 30_000)

        it('chat command on an ignored file', async () => {
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
            await client.openFile(ignoredUri)
            // Cannot execute commands in an ignored files, so this should throw error
            await client.request('commands/explain', null).catch(err => {
                expect(err).toBeDefined()
            })
        }, 30_000)

        it('inline edit on an ignored file', async () => {
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
            await client.openFile(ignoredUri, { removeCursor: false })
            await client.request('editCommands/document', null).catch(err => {
                expect(err).toBeDefined()
            })
        })

        it('ignore rule is not case sensitive', async () => {
            const alsoIgnoredPath = path.join(workspaceRootPath, 'src/is_ignored.ts')
            const result = await client.request('ignore/forUri', {
                uri: URI.file(alsoIgnoredPath).toString(),
            })
            expect(result.policy).toBe('ignore')
        })

        afterAll(async () => {
            // Makes sure cody ignore is still active after tests
            // as it should stay active for each workspace session.
            const result = await client.request('ignore/forUri', {
                uri: URI.file(ignoredPath).toString(),
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
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
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

    function checkEditCommand(
        documentClient: TestClient,
        command: RequestMethodName,
        name: string,
        filename: string,
        param: any,
        assertion: (obtained: string) => void
    ): void {
        it(
            name,
            async () => {
                await documentClient.request('command/execute', {
                    command: 'cody.search.index-update',
                })
                const uri = vscode.Uri.file(path.join(workspaceRootPath, 'src', filename))
                await documentClient.openFile(uri, { removeCursor: false })
                const task = await documentClient.request(command, param)
                await documentClient.taskHasReachedAppliedPhase(task)
                const lenses = documentClient.codeLenses.get(uri.toString()) ?? []
                expect(lenses).toHaveLength(0) // Code lenses are now handled client side

                await documentClient.request('editTask/accept', { id: task.id })
                const newContent = documentClient.workspace.getDocument(uri)?.content
                assertion(trimEndOfLine(newContent))
            },
            20_000
        )
    }

    function checkEditCodeCommand(
        documentClient: TestClient,
        name: string,
        filename: string,
        instruction: string,
        assertion: (obtained: string) => void
    ): void {
        checkEditCommand(
            documentClient,
            'editCommands/code',
            name,
            filename,
            { instruction: instruction },
            assertion
        )
    }

    function checkDocumentCommand(
        documentClient: TestClient,
        name: string,
        filename: string,
        assertion: (obtained: string) => void
    ): void {
        checkEditCommand(documentClient, 'editCommands/document', name, filename, null, assertion)
    }

    describe('Commands', () => {
        it('commands/explain', async () => {
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
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
              "The code you provided, \`@src/animal.ts:1-6\`, defines an interface called \`Animal\` in TypeScript. An interface is a way to describe the structure of an object in TypeScript. It acts as a blueprint or a contract that defines the properties and methods that an object must have.

              The \`Animal\` interface has three properties:

              1. \`name\`: This property represents the name of the animal. It is expected to be a string value.
              2. \`makeAnimalSound()\`: This is a method that is expected to return a string value. It likely represents a function that simulates the sound made by the animal.
              3. \`isMammal\`: This property is a boolean value indicating whether the animal is a mammal or not.

              The purpose of this code is to provide a standardized structure for objects representing animals. It ensures that any object that implements the \`Animal\` interface will have these three properties and methods defined.

              The code itself does not take any direct input, as it is just a definition of an interface. However, when you create an object that implements the \`Animal\` interface, you need to provide values for the \`name\` and \`isMammal\` properties, as well as a implementation for the \`makeAnimalSound()\` method.

              The output of this code is not a direct value, but rather a blueprint or contract that other parts of the codebase can use to create and work with objects representing animals.

              The code achieves its purpose by defining the structure of the \`Animal\` interface. Any object that implements this interface must have the specified properties and methods. This allows for consistent handling of animal objects throughout the codebase, as well as type-checking and code completion benefits provided by TypeScript.

              There are no complex logic flows or data transformations happening in this particular code snippet, as it is simply defining an interface. However, the implementation of the \`makeAnimalSound()\` method in objects that implement the \`Animal\` interface may involve some logic to generate the appropriate sound for each animal."
            `,
                explainPollyError
            )
        }, 30_000)

        // This test seems extra sensitive on Node v16 for some reason.
        it.skipIf(isNode16() || isWindows())(
            'commands/test',
            async () => {
                await client.request('command/execute', {
                    command: 'cody.search.index-update',
                })
                await client.openFile(animalUri)
                const id = await client.request('commands/test', null)
                const lastMessage = await client.firstNonEmptyTranscript(id)
                expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                    `
                  "For the provided code context, it appears that the Vitest test framework is being used, as evidenced by the imports from \`vitest\` in the \`src/example.test.ts\` file.

                  To generate a suite of multiple unit tests for the \`Animal\` interface in the \`src/animal.ts\` file, we can import the necessary types and use the Vitest testing utilities.

                  No new imports needed - using existing libs from Vitest.

                  The generated tests will cover the following aspects of the \`Animal\` interface:

                  1. Ensuring that an implementation of the \`Animal\` interface has the required properties (\`name\`, \`makeAnimalSound\`, and \`isMammal\`).
                  2. Verifying that the \`makeAnimalSound\` method returns a string.
                  3. Testing different scenarios for the \`isMammal\` property.

                  Here is the complete code for the new unit tests, enclosed in a markdown codeblock:

                  \`\`\`typescript
                  import { describe, it, expect } from 'vitest';
                  import type { Animal } from './animal';

                  describe('Animal', () => {
                    class MockAnimal implements Animal {
                      name = 'Mocked Animal';
                      makeAnimalSound = () => 'Mock sound';
                      isMammal = true;
                    }

                    it('should have the required properties', () => {
                      const animal = new MockAnimal();
                      expect(animal).toHaveProperty('name');
                      expect(animal).toHaveProperty('makeAnimalSound');
                      expect(animal).toHaveProperty('isMammal');
                    });

                    it('makeAnimalSound should return a string', () => {
                      const animal = new MockAnimal();
                      const sound = animal.makeAnimalSound();
                      expect(typeof sound).toBe('string');
                    });

                    it('isMammal should be true for mammals', () => {
                      const mammal: Animal = {
                        name: 'Mammal',
                        makeAnimalSound: () => 'Mammal sound',
                        isMammal: true,
                      };
                      expect(mammal.isMammal).toBe(true);
                    });

                    it('isMammal should be false for non-mammals', () => {
                      const nonMammal: Animal = {
                        name: 'Non-Mammal',
                        makeAnimalSound: () => 'Non-mammal sound',
                        isMammal: false,
                      };
                      expect(nonMammal.isMammal).toBe(false);
                    });
                  });
                  \`\`\`

                  This suite of tests covers the essential functionality of the \`Animal\` interface, ensuring that implementations have the required properties, the \`makeAnimalSound\` method returns a string, and the \`isMammal\` property is correctly set based on the type of animal.

                  Note that these tests do not cover any specific implementation details of the \`Animal\` interface, as the provided code only defines the interface itself. If there were specific implementations of \`Animal\`, additional tests could be added to cover those implementations."
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
              "1. Consider separating concerns by creating separate interfaces for different animal types (e.g., \`Mammal\`, \`Bird\`, \`Reptile\`). This would promote better code organization and extensibility, as different animal types may have unique properties and behaviors.

              Benefit: Enhanced code organization, extensibility, and maintainability.

              2. Provide better naming conventions for the \`isMammal\` property. Consider using a more descriptive name like \`isMammalian\` or \`isWarmBlooded\` to better convey the meaning of the property.

              Benefit: Improved code readability and self-documentation.

              3. If the \`makeAnimalSound\` method is intended to return a specific sound for each animal type, consider making it an abstract method or providing a default implementation that throws an error or returns a generic sound. This would prevent instances where the method is not implemented for a specific animal type.

              Benefit: Enhanced code correctness and robustness.

              4. Consider adding documentation (e.g., JSDoc comments) to explain the purpose and usage of the \`Animal\` interface, its properties, and methods. This would improve code maintainability and make it easier for other developers to understand and work with the code.

              Benefit: Improved code maintainability and collaboration.

              5. If performance is a concern and the \`Animal\` interface will be used extensively, consider using a class instead of an interface. Classes can provide better performance optimizations through techniques like inlining and monomorphic dispatch.

              Benefit: Potential performance improvements.

              Overall, the provided code snippet follows sound design principles and adheres to TypeScript's interface declaration syntax. However, there are opportunities to enhance code organization, readability, robustness, and maintainability by addressing the suggestions mentioned above."
            `,
                explainPollyError
            )
        }, 30_000)

        it('editCommand/test', async () => {
            const trickyLogicPath = path.join(workspaceRootPath, 'src', 'trickyLogic.ts')
            const uri = vscode.Uri.file(trickyLogicPath)

            await client.openFile(uri)
            const id = await client.request('editCommands/test', null)
            await client.taskHasReachedAppliedPhase(id)
            const originalDocument = client.workspace.getDocument(uri)!
            expect(trimEndOfLine(originalDocument.getText())).toMatchInlineSnapshot(
                `
              "export function trickyLogic(a: number, b: number): number {
                  if (a === 0) {
                      return 1
                  }
                  if (b === 2) {
                      return 1
                  }

                  return a - b
              }


              "
            `,
                explainPollyError
            )

            const untitledDocuments = client.workspace
                .allUris()
                .filter(uri => vscode.Uri.parse(uri).scheme === 'untitled')
            expect(untitledDocuments).toHaveLength(1)
            const [untitledDocument] = untitledDocuments
            const testDocument = client.workspace.getDocument(vscode.Uri.parse(untitledDocument))
            expect(trimEndOfLine(testDocument?.getText())).toMatchInlineSnapshot(
                `
              "import { expect } from 'vitest'
              import { it } from 'vitest'
              import { describe } from 'vitest'
              import { trickyLogic } from './trickyLogic'

              describe('trickyLogic', () => {
                  it('should return 1 when a is 0', () => {
                      expect(trickyLogic(0, 10)).toBe(1)
                  })

                  it('should return 1 when b is 2', () => {
                      expect(trickyLogic(10, 2)).toBe(1)
                  })

                  it('should return a - b when a is not 0 and b is not 2', () => {
                      expect(trickyLogic(5, 3)).toBe(2)
                      expect(trickyLogic(10, 5)).toBe(5)
                  })

                  it('should handle negative numbers', () => {
                      expect(trickyLogic(-5, 3)).toBe(-8)
                      expect(trickyLogic(5, -3)).toBe(8)
                  })
              })
              "
            `,
                explainPollyError
            )

            // Just to make sure the edit happened via `workspace/edit` instead
            // of `textDocument/edit`.
            expect(client.workspaceEditParams).toHaveLength(1)
        }, 30_000)

        describe('Edit code', () => {
            checkEditCodeCommand(
                client,
                'editCommands/code (basic function)',
                'sum.ts',
                'Rename `a` parameter to `c`',
                obtained =>
                    expect(obtained).toMatchInlineSnapshot(
                        `
                  "export function sum(c: number, b: number): number {
                      /* CURSOR */
                  }
                  "
                `,
                        explainPollyError
                    )
            )
        })

        describe('Document code', () => {
            checkDocumentCommand(client, 'editCommands/document (basic function)', 'sum.ts', obtained =>
                expect(obtained).toMatchInlineSnapshot(
                    `
                  "/**
                   * Adds two numbers and returns the result.
                   * @param a - The first number to add.
                   * @param b - The second number to add.
                   * @returns The sum of \`a\` and \`b\`.
                   */
                  export function sum(a: number, b: number): number {
                      /* CURSOR */
                  }
                  "
                `,
                    explainPollyError
                )
            )

            checkDocumentCommand(
                client,
                'commands/document (Method as part of a class)',
                'TestClass.ts',
                obtained =>
                    expect(obtained).toMatchInlineSnapshot(
                        `
                  "const foo = 42

                  export class TestClass {
                      constructor(private shouldGreet: boolean) {}

                          /**
                       * Logs a "Hello World!" message to the console if the \`shouldGreet\` property is true.
                       */
                  public functionName() {
                          if (this.shouldGreet) {
                              console.log(/* CURSOR */ 'Hello World!')
                          }
                      }
                  }
                  "
                `,
                        explainPollyError
                    )
            )

            checkDocumentCommand(
                client,
                'commands/document (Function within a property)',
                'TestLogger.ts',
                obtained =>
                    expect(obtained).toMatchInlineSnapshot(
                        `
                      "const foo = 42
                      export const TestLogger = {
                          startLogging: () => {
                              // Do some stuff

                                      /**
                               * Records a log message.
                               */
                      function recordLog() {
                                  console.log(/* CURSOR */ 'Recording the log')
                              }

                              recordLog()
                          },
                      }
                      "
                    `,
                        explainPollyError
                    )
            )

            checkDocumentCommand(
                client,
                'commands/document (nested test case)',
                'example.test.ts',
                obtained =>
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
                                  /**
                           * Retrieves the current time in milliseconds since the page was loaded.
                           * This can be used to measure the duration of an operation.
                           */
                  const startTime = performance.now(/* CURSOR */)
                      })
                  })
                  "
                `,
                        explainPollyError
                    )
            )
        })
    })

    describe('Custom Commands', () => {
        it('commands/custom, chat command, open tabs context', async () => {
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
            // Note: The test editor has all the files opened from previous tests as open tabs,
            // so we will need to open a new file that has not been opened before,
            // to make sure this context type is working.
            const trickyLogicPath = path.join(workspaceRootPath, 'src', 'trickyLogic.ts')
            const trickyLogicUri = vscode.Uri.file(trickyLogicPath)
            await client.openFile(trickyLogicUri)

            const result = (await client.request('commands/custom', {
                key: '/countTabs',
            })) as CustomChatCommandResult
            expect(result.type).toBe('chat')
            const lastMessage = await client.firstNonEmptyTranscript(result?.chatResult as string)
            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `
              "Based on the codebase context you provided, the file names are:

              1. \`src/trickyLogic.ts\`
              2. \`src/animal.ts\`
              3. \`src/example.test.ts\`
              4. \`src/multiple-selections.ts\`
              5. \`src/squirrel.ts\`
              6. \`src/sum.ts\`
              7. \`src/TestClass.ts\`
              8. \`src/TestLogger.ts\`
              9. \`src/trickyLogic.ts\` (repeated)"
            `,
                explainPollyError
            )
        }, 30_000)

        it('commands/custom, chat command, adds argument', async () => {
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
            await client.openFile(animalUri)
            const result = (await client.request('commands/custom', {
                key: '/translate Python',
            })) as CustomChatCommandResult
            expect(result.type).toBe('chat')
            const lastMessage = await client.firstNonEmptyTranscript(result?.chatResult as string)
            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `
              "Here's the translation of the selected TypeScript code into Python:

              \`\`\`python
              from abc import ABC, abstractmethod

              class Animal(ABC):
                  @abstractmethod
                  def makeAnimalSound(self) -> str:
                      pass

                  @property
                  @abstractmethod
                  def isMammal(self) -> bool:
                      pass

                  @property
                  @abstractmethod
                  def name(self) -> str:
                      pass
              \`\`\`

              Explanation:

              1. In Python, we don't have interfaces like in TypeScript. Instead, we use abstract classes with abstract methods to achieve a similar behavior.
              2. The \`Animal\` class is defined as an abstract base class (ABC) using the \`abc\` module.
              3. The \`makeAnimalSound\` method is defined as an abstract method using the \`@abstractmethod\` decorator. It returns a string.
              4. The \`isMammal\` and \`name\` properties are defined as abstract properties using the \`@abstractmethod\` and \`@property\` decorators. \`isMammal\` returns a boolean, and \`name\` returns a string.

              In Python, classes that inherit from the \`Animal\` abstract base class must implement all the abstract methods and properties defined in the base class. This enforces a similar behavior to the TypeScript interface."
            `,
                explainPollyError
            )
        }, 30_000)

        it('commands/custom, chat command, no context', async () => {
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
            await client.openFile(animalUri)
            const result = (await client.request('commands/custom', {
                key: '/none',
            })) as CustomChatCommandResult
            expect(result.type).toBe('chat')
            const lastMessage = await client.firstNonEmptyTranscript(result.chatResult as string)
            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `"no"`,
                explainPollyError
            )
        }, 30_000)

        // The context files are presented in an order in the CI that is different
        // than the order shown in recordings when on Windows, causing it to fail.
        it('commands/custom, chat command, current directory context', async () => {
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
            await client.openFile(animalUri)
            const result = (await client.request('commands/custom', {
                key: '/countDirFiles',
            })) as CustomChatCommandResult
            expect(result.type).toBe('chat')
            const lastMessage = await client.firstNonEmptyTranscript(result.chatResult as string)
            const reply = trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')
            expect(reply).not.includes('.cody/ignore') // file that's not located in the src/directory
            expect(reply).toMatchInlineSnapshot(
                `
                "You have shared codebase context from 9 different files."
            `,
                explainPollyError
            )
        }, 30_000)

        it('commands/custom, edit command, insert mode', async () => {
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
            await client.openFile(sumUri, { removeCursor: false })
            const result = (await client.request('commands/custom', {
                key: '/hello',
            })) as CustomEditCommandResult
            expect(result.type).toBe('edit')
            await client.taskHasReachedAppliedPhase(result.editResult as EditTask)

            const originalDocument = client.workspace.getDocument(sumUri)!
            expect(trimEndOfLine(originalDocument.getText())).toMatchInlineSnapshot(
                `
              "// hello
              export function sum(a: number, b: number): number {
                  /* CURSOR */
              }
              "
            `,
                explainPollyError
            )
        }, 30_000)

        it('commands/custom, edit command, edit mode', async () => {
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
            await client.openFile(animalUri)

            const result = (await client.request('commands/custom', {
                key: '/newField',
            })) as CustomEditCommandResult
            expect(result.type).toBe('edit')
            await client.taskHasReachedAppliedPhase(result.editResult as EditTask)

            const originalDocument = client.workspace.getDocument(animalUri)!
            expect(trimEndOfLine(originalDocument.getText())).toMatchInlineSnapshot(`
              "export interface Animal {
                  name: string
                  makeAnimalSound(): string
                  isMammal: boolean
                  printName(): void {
                      console.log(this.name);
                  }
              }

              "
            `)
        }, 30_000)
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
        const rateLimitedClient = new TestClient({
            name: 'rateLimitedClient',
            accessToken:
                process.env.SRC_ACCESS_TOKEN_WITH_RATE_LIMIT ??
                // See comment above `const client =` about how this value is derived.
                'REDACTED_8c77b24d9f3d0e679509263c553887f2887d67d33c4e3544039c1889484644f5',
        })
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
        const enterpriseClient = new TestClient({
            name: 'enterpriseClient',
            accessToken:
                process.env.SRC_ENTERPRISE_ACCESS_TOKEN ??
                // See comment above `const client =` about how this value is derived.
                'REDACTED_b20717265e7ab1d132874d8ff0be053ab9c1dacccec8dce0bbba76888b6a0a69',
            serverEndpoint: 'https://demo.sourcegraph.com',
            telemetryExporter: 'graphql',
            logEventMode: 'connected-instance-only',
        })
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

        checkDocumentCommand(
            enterpriseClient,
            'commands/document (enterprise client)',
            'example.test.ts',
            obtained =>
                expect(obtained).toMatchInlineSnapshot(
                    `
              "import { expect } from 'vitest'
              import { it } from 'vitest'
              import { describe } from 'vitest'

              /**
               * A test block that contains:
               * - A test to assert true is true
               * - A second test to assert true is true
               * - A test expecting an error due to incorrect usage of performance.now
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
            `,
                    explainPollyError
                )
        )

        // NOTE(olafurpg) disabled on Windows because the multi-repo keyword
        // query is not replaying on Windows due to some platform-dependency on
        // how the HTTP request is constructed. I manually tested multi-repo on
        // a Windows computer to confirm that it does work as expected.
        it.skipIf(isWindows())(
            'chat/submitMessage (addEnhancedContext: true, multi-repo test)',
            async () => {
                const id = await enterpriseClient.request('chat/new', null)
                const { repos } = await enterpriseClient.request('graphql/getRepoIds', {
                    names: ['github.com/sourcegraph/sourcegraph'],
                    first: 1,
                })
                await enterpriseClient.request('webview/receiveMessage', {
                    id,
                    message: {
                        command: 'context/choose-remote-search-repo',
                        explicitRepos: repos,
                    },
                })
                const { lastMessage, transcript } =
                    await enterpriseClient.sendSingleMessageToNewChatWithFullTranscript(
                        'What is Squirrel?',
                        {
                            id,
                            addEnhancedContext: true,
                        }
                    )

                expect(lastMessage?.text ?? '').includes('code intelligence')
                expect(lastMessage?.text ?? '').includes('tree-sitter')

                const contextUris: URI[] = []
                for (const message of transcript.messages) {
                    for (const file of message.contextFiles ?? []) {
                        if (file.type === 'file') {
                            file.uri = URI.from(file.uri)
                            contextUris.push(file.uri)
                        }
                    }
                }
                const paths = contextUris.map(uri => uri.path.split('/-/blob/').at(1) ?? '').sort()
                expect(paths).includes('cmd/symbols/squirrel/README.md')

                const { remoteRepos } = await enterpriseClient.request('chat/remoteRepos', { id })
                expect(remoteRepos).toStrictEqual(repos)
            },
            30_000
        )

        it('remoteRepo/list', async () => {
            // List a repo without a query
            let repos: Requests['remoteRepo/list'][1]
            do {
                repos = await enterpriseClient.request('remoteRepo/list', {
                    query: undefined,
                    first: 10,
                })
            } while (repos.state.state === 'fetching')
            expect(repos.repos).toHaveLength(10)

            // Make a paginated query.
            const secondLastRepo = repos.repos.at(-2)
            const moreRepos = await enterpriseClient.request('remoteRepo/list', {
                query: undefined,
                first: 2,
                afterId: secondLastRepo?.id,
            })
            expect(moreRepos.repos[0].id).toBe(repos.repos.at(-1)?.id)

            // Make a query.
            const filteredRepos = await enterpriseClient.request('remoteRepo/list', {
                query: 'sourceco',
                first: 1000,
            })
            expect(
                filteredRepos.repos.find(repo => repo.name === 'github.com/sourcegraph/cody')
            ).toBeDefined()
        })

        it('remoteRepo/has', async () => {
            // Query a repo that does exist.
            const codyRepoExists = await enterpriseClient.request('remoteRepo/has', {
                repoName: 'github.com/sourcegraph/cody',
            })
            expect(codyRepoExists.result).toBe(true)

            // Query a repo that does not exist.
            const codyForDos = await enterpriseClient.request('remoteRepo/has', {
                repoName: 'github.com/sourcegraph/cody-edlin',
            })
            expect(codyForDos.result).toBe(false)
        })

        it('testing/ignore/overridePolicy', async () => {
            // To test that testing/ignore/overridePolicy generates an
            // ignore/didChange notification, 'stop' sets up a Promise, 'go'
            // unblocks it.
            let go = () => {}
            function stop() {
                return new Promise(resolve => {
                    go = () => resolve(undefined)
                })
            }
            enterpriseClient.registerNotification('ignore/didChange', () => {
                go()
            })
            expect(await enterpriseClient.request('ignore/forUri', { uri: 'file:///foo/bar.txt' })).toBe(
                { policy: 'use' }
            )
            await Promise.all([
                stop(),
                enterpriseClient.request('testing/ignore/overridePolicy', [
                    {
                        repoRe: '$^',
                        uriRe: '.*bar.*',
                    },
                ]),
            ])
            expect(await enterpriseClient.request('ignore/forUri', { uri: 'file:///foo/bar.txt' })).toBe(
                { policy: 'ignore' }
            )
            expect(
                await enterpriseClient.request('ignore/forUri', { uri: 'file:///foo/quux.txt' })
            ).toBe({ policy: 'use' })
            await Promise.all([
                stop(),
                enterpriseClient.request('testing/ignore/overridePolicy', [undefined]),
            ])
            expect(await enterpriseClient.request('ignore/forUri', { uri: 'file:///foo/bar.txt' })).toBe(
                { policy: 'use' }
            )
            // Stop listening to 'ignore/didChange'
            enterpriseClient.registerNotification('ignore/didChange', () => {})
        })

        afterAll(async () => {
            const { requests } = await enterpriseClient.request('testing/networkRequests', null)
            const nonServerInstanceRequests = requests
                .filter(({ url }) => !url.startsWith(enterpriseClient.serverEndpoint))
                .map(({ url }) => url)
            expect(JSON.stringify(nonServerInstanceRequests)).toStrictEqual('[]')
            await enterpriseClient.shutdownAndExit()
            // Long timeout because to allow Polly.js to persist HTTP recordings
        }, 30_000)
    })

    // Enterprise tests are run at demo instance, which is at a recent release version.
    // Use this section if you need to run against S2 which is released continuously.
    describe('Enterprise - close main branch', () => {
        const enterpriseClient = new TestClient({
            name: 'enterpriseMainBranchClient',
            accessToken:
                process.env.SRC_S2_ACCESS_TOKEN ??
                // See comment above `const client =` about how this value is derived.
                'REDACTED_ad28238383af71357085701263df7766e6f7f8ad1afc344d71aaf69a07143677',
            serverEndpoint: 'https://sourcegraph.sourcegraph.com',
            telemetryExporter: 'graphql',
            logEventMode: 'connected-instance-only',
        })

        // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
        beforeAll(async () => {
            const serverInfo = await enterpriseClient.initialize()

            expect(serverInfo.authStatus?.isLoggedIn).toBeTruthy()
            expect(serverInfo.authStatus?.username).toStrictEqual('codytesting')
        }, 10_000)

        it('attribution/found', async () => {
            const id = await enterpriseClient.request('chat/new', null)
            const { repoNames, error } = await enterpriseClient.request('attribution/search', {
                id,
                snippet: 'sourcegraph.Location(new URL',
            })
            expect(repoNames).not.empty
            expect(error).null
        }, 20_000)

        it('attribution/not found', async () => {
            const id = await enterpriseClient.request('chat/new', null)
            const { repoNames, error } = await enterpriseClient.request('attribution/search', {
                id,
                snippet: 'sourcegraph.Location(new LRU',
            })
            expect(repoNames).empty
            expect(error).null
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
