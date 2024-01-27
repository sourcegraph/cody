import assert from 'assert'
import { execSync } from 'child_process'
import fspromises from 'fs/promises'
import os from 'os'
import path from 'path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Uri } from 'vscode'

import { isWindows } from '@sourcegraph/cody-shared'

import type { ExtensionTranscriptMessage } from '../../vscode/src/chat/protocol'

import { URI } from 'vscode-uri'
import { isNode16 } from './isNode16'
import { TestClient, asTranscriptMessage } from './TestClient'

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

    const client = new TestClient({
        name: 'defaultClient',
        // The redacted ID below is copy-pasted from the recording file and
        // needs to be updated whenever we change the underlying access token.
        // We can't return a random string here because then Polly won't be able
        // to associate the HTTP requests between record mode and replay mode.
        accessToken:
            process.env.SRC_ACCESS_TOKEN ??
            'REDACTED_3709f5bf232c2abca4c612f0768368b57919ca6eaa470e3fd7160cbf3e8d0ec3',
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
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
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

    describe('Commands', () => {
        it('commands/explain', async () => {
            await client.request('command/execute', {
                command: 'cody.search.index-update',
            })
            await client.openFile(animalUri)
            const id = await client.request('commands/explain', null)
            const lastMessage = await client.firstNonEmptyTranscript(id)
            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
                `
              " The Animal interface:

              The Animal interface defines the shape of objects that represent animals. Interfaces in TypeScript are used to define the structure of an object - what properties and methods it should have.

              This interface has three properties:

              1. name - This will be a string property to represent the animal's name.

              2. makeAnimalSound() - This is a method that will be implemented by classes that implement the Animal interface. It allows each animal to have its own implementation of making a sound.

              3. isMammal - This is a boolean property that will specify if the animal is a mammal or not.

              The interface does not contain any actual implementation, just the definition of what properties and methods any class implementing Animal should have. This allows us to define a consistent structure that can be reused across different animal classes.

              By defining an Animal interface, we can then create multiple classes like Dog, Cat, Bird etc that implement the interface and provide their own specific logic while ensuring they match the general Animal structure.

              Interfaces are a powerful way to define contracts in TypeScript code and allow different implementations to guarantee they can work together smoothly. This Animal interface creates a reusable way to model animals in a type-safe way."
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
              " Okay, based on the shared context, it looks like:

              - The test framework in use is Vitest
              - The assertion library is vitest's built-in expect

              No additional packages or imports are needed.

              I will focus on testing the Animal interface by validating:

              - The name property is a string
              - makeAnimalSound returns a string
              - isMammal is a boolean

              \`\`\`ts
              import { expect } from 'vitest'
              import { describe, it } from 'vitest'
              import { Animal } from './animal'

              describe('Animal', () => {

                it('has a name property that is a string', () => {
                  const animal: Animal = {
                    name: 'Lion',
                    makeAnimalSound: () => '',
                    isMammal: true
                  }

                  expect(typeof animal.name).toBe('string')
                })

                it('makeAnimalSound returns a string', () => {
                  const animal: Animal = {
                    name: 'Lion',
                    makeAnimalSound: () => 'Roar!',
                    isMammal: true
                  }

                  expect(typeof animal.makeAnimalSound()).toBe('string')
                })

                it('isMammal is a boolean', () => {
                  const animal: Animal = {
                    name: 'Lion',
                    makeAnimalSound: () => '',
                    isMammal: true
                  }

                  expect(typeof animal.isMammal).toBe('boolean')
                })

              })
              \`\`\`

              This covers basic validation of the Animal interface's properties and methods. Let me know if you'd like me to expand the tests further."
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

              1. Add type annotations for method parameters and return types:

              \`\`\`
              export interface Animal {
                name: string
                makeAnimalSound(volume?: number): string
                isMammal: boolean
              }
              \`\`\`

              Adding explicit types for methods makes the interface clearer and allows TypeScript to catch more errors at compile time.

              2. Make name readonly:

              \`\`\`
              export interface Animal {
                readonly name: string
                // ...
              }
              \`\`\`

              This prevents the name from being reassigned after initialization, making the code more robust.

              3. Add alternate method name:

              \`\`\`
              export interface Animal {

                // ...

                getSound(): string
              }
              \`\`\`

              Adding a method like \`getSound()\` as an alias for \`makeAnimalSound()\` improves readability.

              4. Use boolean getter instead of property for isMammal:

              \`\`\`
              export interface Animal {

                // ...

                get isMammal(): boolean
              }
              \`\`\`

              This allows encapsulation of the logic for determining if mammal.

              5. Extend a base interface like LivingThing:

              \`\`\`
              interface LivingThing {
                name: string
              }

              interface Animal extends LivingThing {
                // ...
              }
              \`\`\`

              This improves maintainability by separating common properties into a base interface.

              Overall, the code is well-written but could benefit from some minor changes like adding types, encapsulation, and semantic method names. The interface follows sound principles like read-only properties andboolean getters. No major issues were found."
            `,
                explainPollyError
            )
        }, 30_000)

        describe('Document code', () => {
            function check(name: string, filename: string, assertion: (obtained: string) => void): void {
                it(name, async () => {
                    await client.request('command/execute', {
                        command: 'cody.search.index-update',
                    })
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
                'REDACTED_b20717265e7ab1d132874d8ff0be053ab9c1dacccec8dce0bbba76888b6a0asd',
            serverEndpoint: 'https://sourcegraph.sourcegraph.com',
            telemetryExporter: 'graphql',
            logEventMode: 'connected-instance-only',
        })

        // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
        beforeAll(async () => {
            const serverInfo = await enterpriseClient.initialize()

            expect(serverInfo.authStatus?.isLoggedIn).toBeTruthy()
            expect(serverInfo.authStatus?.username).toStrictEqual('chwarwick')
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
