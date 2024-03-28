import assert from 'assert'
import { execSync } from 'child_process'
import os from 'os'
import path from 'path'
import fspromises from 'fs/promises'
import * as vscode from 'vscode'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { isWindows } from '@sourcegraph/cody-shared'

import { URI } from 'vscode-uri'
import { TestClient, asTranscriptMessage } from './TestClient'
import { decodeURIs } from './decodeURIs'
import { isNode16 } from './isNode16'
import type { CustomChatCommandResult, CustomEditCommandResult, EditTask } from './protocol-alias'

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
        const codyIgnore = await client.request('check/isCodyIgnoredFile', {
            urls: [ignoredPath],
        })
        expect(codyIgnore).toBeTruthy()
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
              "Sure, here's a simple "Hello World" function in Java:

              \`\`\`java
              public class HelloWorld {
                  public static void main(String[] args) {
                      System.out.println("Hello World!");
                  }
              }
              \`\`\`

              To explain:

              1. \`public class HelloWorld { ... }\` defines a new class named \`HelloWorld\`.
              2. \`public static void main(String[] args)\` is the main method that serves as the entry point of the Java program.
              3. \`System.out.println("Hello World!");\` prints the string "Hello World!" to the console.

              To run this program, you'll need to save it in a file with a \`.java\` extension (e.g., \`HelloWorld.java\`), compile it using the Java compiler (\`javac HelloWorld.java\`), and then run the compiled bytecode with the Java Virtual Machine (\`java HelloWorld\`)."
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
                `"I'm afraid I don't know the specific details of what model architecture or training approach was used to create me. That information hasn't been shared publicly by the Anthropic team that developed me. What I can say is that I am a large language model focused on coding assistance and technical topics. But the exact model name or type is not something I'm aware of. Please let me know if there are any other ways I can try to help!"`,
                explainPollyError
            )
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
            expect(trimEndOfLine(lastMessage?.text ?? '')).toMatchInlineSnapshot(`
              "\`\`\`typescript
              class Dog implements Animal {
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
            `)
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

            const result = await client.request('check/isCodyIgnoredFile', {
                urls: [ignoredPath],
            })
            expect(result).toBeTruthy()
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
            const contextFilesUrls = contextFiles.map(f => f.uri?.path)
            const result = await client.request('check/isCodyIgnoredFile', {
                urls: contextFilesUrls,
            })
            expect(result).toBeFalsy()
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
            const result = await client.request('check/isCodyIgnoredFile', {
                urls: contextUrls,
            })
            expect(result).toBeFalsy()
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
            await client.request('commands/document', null).catch(err => {
                expect(err).toBeDefined()
            })
        })

        it('ignore rule is not case sensitive', async () => {
            const alsoIgnoredPath = path.join(workspaceRootPath, 'src/is_ignored.ts')
            const result = await client.request('check/isCodyIgnoredFile', {
                urls: [alsoIgnoredPath],
            })
            expect(result).toBeTruthy()
        })

        afterAll(async () => {
            // Makes sure cody ignore is still active after tests
            // as it should stay active for each workspace session.
            const result = await client.request('check/isCodyIgnoredFile', {
                urls: [ignoredPath],
            })
            expect(result).toBeTruthy()

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

    function checkDocumentCommand(
        documentClient: TestClient,
        name: string,
        filename: string,
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
                const task = await documentClient.request('commands/document', null)
                await documentClient.taskHasReachedAppliedPhase(task)
                const lenses = documentClient.codeLenses.get(uri.toString()) ?? []
                expect(lenses).toHaveLength(0) // Code lenses are now handled client side

                await documentClient.request('editTask/accept', task.id)
                const newContent = documentClient.workspace.getDocument(uri)?.content
                assertion(trimEndOfLine(newContent))
            },
            20_000
        )
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
              "The code \`@src/animal.ts:1-6\` defines an interface named \`Animal\` in TypeScript. An interface is a way to describe the structure of an object, specifying the properties and methods it should have.

              The \`Animal\` interface has three members:

              1. \`name: string\`: This declares that objects implementing the \`Animal\` interface should have a property named \`name\` of type \`string\`. This property is expected to hold the name of the animal as a string value.

              2. \`makeAnimalSound(): string\`: This declares a method named \`makeAnimalSound\` that should be present in objects implementing the \`Animal\` interface. The method is expected to return a \`string\` value, which likely represents the sound the animal makes.

              3. \`isMammal: boolean\`: This declares a property named \`isMammal\` of type \`boolean\`. This property is expected to hold a true or false value indicating whether the animal is a mammal or not.

              The purpose of this code is to define a contract or blueprint for objects representing animals. It specifies the properties and methods that any object claiming to be an \`Animal\` should have.

              This interface does not take any direct input, as it is a definition or a blueprint. However, when creating objects that implement this interface, you would need to provide values for the \`name\` and \`isMammal\` properties, as well as define the implementation of the \`makeAnimalSound\` method.

              The output of this code is the \`Animal\` interface itself, which can be used elsewhere in the codebase to ensure objects representing animals conform to the specified structure.

              The code achieves its purpose by leveraging TypeScript's interface feature, which allows developers to define the structure of objects in a clear and concise manner. By defining the \`Animal\` interface, developers can ensure that all objects representing animals in their codebase have the necessary properties and methods, promoting code consistency and maintainability.

              There is no complex logic or data transformation happening within this code snippet itself. It simply serves as a blueprint or contract for objects representing animals."
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
                  "Based on the provided context, the test framework being used is Vitest, which is a Vite-native test runner. It includes the \`vitest\` package, which provides the \`describe\`, \`it\`, and \`expect\` functions for writing tests.

                  Since there is no existing test suite for \`src/animal.ts\`, I will generate a new suite with multiple unit tests for the \`Animal\` interface and its associated functions.

                  Imports:

                  \`\`\`typescript
                  import { describe, it, expect } from 'vitest'
                  import { Animal } from './animal'
                  \`\`\`

                  Test Coverage Summary:
                  - The generated tests cover the basic functionality of the \`Animal\` interface, including checking the \`makeAnimalSound\` method and validating the \`isMammal\` property.
                  - Edge cases such as empty strings or invalid input for \`name\` are not covered in these tests.
                  - No mocking is included as there are no dependencies or external functions in the provided code.

                  Unit Tests:

                  \`\`\`typescript
                  describe('Animal', () => {
                    it('should create an instance of Animal with correct properties', () => {
                      const animal: Animal = {
                        name: 'Fluffy',
                        makeAnimalSound: () => 'Meow',
                        isMammal: true
                      }

                      expect(animal.name).toBe('Fluffy')
                      expect(animal.makeAnimalSound()).toBe('Meow')
                      expect(animal.isMammal).toBe(true)
                    })

                    it('should return the correct animal sound', () => {
                      const animal: Animal = {
                        name: 'Doggo',
                        makeAnimalSound: () => 'Woof',
                        isMammal: true
                      }

                      expect(animal.makeAnimalSound()).toBe('Woof')
                    })

                    it('should correctly identify a mammal', () => {
                      const mammal: Animal = {
                        name: 'Elephant',
                        makeAnimalSound: () => 'Trumpet',
                        isMammal: true
                      }

                      const nonMammal: Animal = {
                        name: 'Parrot',
                        makeAnimalSound: () => 'Squawk',
                        isMammal: false
                      }

                      expect(mammal.isMammal).toBe(true)
                      expect(nonMammal.isMammal).toBe(false)
                    })
                  })
                  \`\`\`"
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
              "1. Consider using an abstract class instead of an interface: Interfaces in TypeScript are great for defining contract shapes, but they lack the ability to provide method implementations. By using an abstract class, you can define default implementations for methods like \`makeAnimalSound()\` and have concrete animal classes inherit from the abstract class and override the methods as needed. This can promote code reuse and reduce duplication across different animal types.

              Benefits: Code reuse, easier maintenance, and better organization of related functionality.

              2. Introduce a more descriptive naming convention: The name \`Animal\` is quite broad and may not convey enough information about the intended purpose or usage of this interface. Consider using a more specific name or incorporating a naming prefix or suffix to provide better context and improve code readability.

              Benefits: Improved code readability and maintainability.

              3. Consider separating concerns: If the \`Animal\` interface is part of a larger system or module, it may be beneficial to split it into separate files or modules based on their responsibilities. For example, you could have a separate file for animal-related interfaces, another for utility functions, and so on. This can improve code organization and make it easier to maintain and understand the codebase.

              Benefits: Better code organization, separation of concerns, and improved maintainability.

              4. Add documentation: While the code is relatively simple, it's always a good practice to include documentation, either through comments or using TypeScript's built-in documentation syntax (triple-slash comments). This can help other developers (or your future self) understand the purpose, usage, and expected behavior of the \`Animal\` interface and its properties/methods.

              Benefits: Improved code readability, maintainability, and knowledge sharing.

              5. Consider adding type guards or runtime checks: Depending on the use case, it might be beneficial to add type guards or runtime checks to ensure that objects implementing the \`Animal\` interface conform to the expected shape and behavior. This can help catch potential errors or inconsistencies early and improve the overall robustness of the codebase.

              Benefits: Improved code robustness, early error detection, and better type safety.

              Overall, the provided code follows sound design principles and adheres to TypeScript conventions. While there are no glaring errors, the suggestions above aim to enhance code quality, readability, maintainability, and robustness. Implementing these recommendations can make the codebase more scalable, easier to understand, and better positioned for future growth and maintenance."
            `,
                explainPollyError
            )
        }, 30_000)

        // Skipped because it's timing out for some reason and the functionality
        // is still not working 100% correctly. Keeping the test so we can fix
        // the test later.
        it.skip('editCommand/test', async () => {
            const trickyLogicPath = path.join(workspaceRootPath, 'src', 'trickyLogic.ts')
            const uri = vscode.Uri.file(trickyLogicPath)

            await client.openFile(uri)
            const id = await client.request('editCommands/test', null)
            await client.taskHasReachedAppliedPhase(id)
            const originalDocument = client.workspace.getDocument(uri)!
            expect(trimEndOfLine(originalDocument.getText())).toMatchInlineSnapshot(`
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
            `)

            const untitledDocuments = client.workspace
                .allUris()
                .filter(uri => vscode.Uri.parse(uri).scheme === 'untitled')
            expect(untitledDocuments).toHaveLength(1)
            const [untitledDocument] = untitledDocuments
            const testDocment = client.workspace.getDocument(vscode.Uri.parse(untitledDocument))
            expect(trimEndOfLine(testDocment?.getText())).toMatchInlineSnapshot(`
              "import { trickyLogic } from './trickyLogic';

              describe('trickyLogic', () => {
                it('should return 1 if a is 0', () => {
                  expect(trickyLogic(0, 1)).toBe(1);
                });

                it('should return 1 if b is 2', () => {
                  expect(trickyLogic(1, 2)).toBe(1);
                });

                it('should return a - b if neither a is 0 nor b is 2', () => {
                  expect(trickyLogic(3, 1)).toBe(2);
                });
              });
              "
            `)

            // Just to make sure the edit happened via `workspace/edit` instead
            // of `textDocument/edit`.
            expect(client.workspaceEditParams).toHaveLength(1)
        }, 30_000)

        describe('Document code', () => {
            checkDocumentCommand(client, 'commands/document (basic function)', 'sum.ts', obtained =>
                expect(obtained).toMatchInlineSnapshot(`
                  "/**
                   * Adds two numbers together and returns the result.
                   *
                   * @param a The first number to add.
                   * @param b The second number to add.
                   * @returns The sum of \`a\` and \`b\`.
                   */
                  export function sum(a: number, b: number): number {
                      /* CURSOR */
                  }
                  "
                `)
            )

            checkDocumentCommand(
                client,
                'commands/document (Method as part of a class)',
                'TestClass.ts',
                obtained =>
                    expect(obtained).toMatchInlineSnapshot(`
                      "const foo = 42

                      export class TestClass {
                          constructor(private shouldGreet: boolean) {}

                              /**
                           * Greets the user with "Hello World!" if the \`shouldGreet\` flag is true.
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

            checkDocumentCommand(
                client,
                'commands/document (Function within a property)',
                'TestLogger.ts',
                obtained =>
                    expect(obtained).toMatchInlineSnapshot(`
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
                    `)
            )

            checkDocumentCommand(
                client,
                'commands/document (nested test case)',
                'example.test.ts',
                obtained =>
                    expect(obtained).toMatchInlineSnapshot(`
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
                               * Returns the current time in milliseconds since the page was loaded.
                               * This can be used to measure the duration of an operation.
                               */
                      const startTime = performance.now(/* CURSOR */)
                          })
                      })
                      "
                    `)
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
              "Based on the file paths you've shared, the file names are:

              1. \`src/trickyLogic.ts\`
              2. \`src/TestLogger.ts\`
              3. \`src/TestClass.ts\`
              4. \`src/sum.ts\`
              5. \`src/squirrel.ts\`
              6. \`src/multiple-selections.ts\`
              7. \`src/example.test.ts\`
              8. \`src/animal.ts\`
              9. \`.cody/ignore\`"
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
              "Here is the equivalent Python code for the provided TypeScript interface:

              \`\`\`python
              class Animal:
                  def __init__(self, name, is_mammal):
                      self.name = name
                      self.is_mammal = is_mammal

                  def make_animal_sound(self):
                      raise NotImplementedError("Subclasses must implement make_animal_sound method")
              \`\`\`

              In Python, we use classes to define interfaces or abstract base classes. The \`Animal\` class has an \`__init__\` method that initializes the \`name\` and \`is_mammal\` attributes. The \`make_animal_sound\` method is defined but raises a \`NotImplementedError\` exception, indicating that subclasses of \`Animal\` must implement this method.

              To create concrete animal types, you would create subclasses of \`Animal\` and implement the \`make_animal_sound\` method. For example:

              \`\`\`python
              class Dog(Animal):
                  def make_animal_sound(self):
                      return "Woof!"

              class Cat(Animal):
                  def make_animal_sound(self):
                      return "Meow!"
              \`\`\`

              In the above example, \`Dog\` and \`Cat\` are concrete implementations of the \`Animal\` class, providing their own versions of the \`make_animal_sound\` method."
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
                `"No"`,
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
                `"You have shared codebase context from 11 different files."`,
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
            expect(trimEndOfLine(originalDocument.getText())).toMatchInlineSnapshot(
                `
              "/* SELECTION_START */
              export interface Animal {
                  name: string
                  makeAnimalSound(): string
                  isMammal: boolean
                  logName(): void {
                      console.log(this.name);
                  }
              }
              /* SELECTION_END */
              "
            `,
                explainPollyError
            )
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
                expect(obtained).toMatchInlineSnapshot(`
                  "import { expect } from 'vitest'
                  import { it } from 'vitest'
                  import { describe } from 'vitest'

                  /**
                   * Describe block that runs vitest tests.
                   * Contains 3 test cases:
                   * - Does test 1
                   * - Does test 2
                   * - Does something else (has incorrect usage of performance.now)
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
