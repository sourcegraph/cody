import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
    type ContextItem,
    DOTCOM_URL,
    ModelUsage,
    type SerializedChatTranscript,
} from '@sourcegraph/cody-shared'
import * as uuid from 'uuid'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { logTestingData } from '../../vscode/test/fixtures/mock-server'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import { decodeURIs } from './decodeURIs'
import type { ChatExportResult } from './protocol-alias'
import { trimEndOfLine } from './trimEndOfLine'
const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))

const mayRecord =
    process.env.CODY_RECORDING_MODE === 'record' || process.env.CODY_RECORD_IF_MISSING === 'true'

async function exportedTelemetryEvents(currentClient: TestClient) {
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
    const loggedTelemetryEventsV2 = response.events.map(
        (event: { feature: string; action: string }) => `${event.feature}:${event.action}`
    )
    return loggedTelemetryEventsV2
}

describe('Agent', () => {
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'defaultClient',
        credentials: TESTING_CREDENTIALS.enterprise,
    })

    const mockContextItems: ContextItem[] = []

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
        expect(serverInfo?.authStatus?.authenticated).toBeFalsy()

        // Log in so test cases are authenticated by default
        const valid = await client.request('extensionConfiguration/change', {
            ...client.info.extensionConfiguration,
            accessToken: client.info.extensionConfiguration?.accessToken ?? 'invalid',
            serverEndpoint: client.info.extensionConfiguration?.serverEndpoint ?? DOTCOM_URL.toString(),
            customHeaders: {},
        })
        expect(valid?.authenticated).toBe(true)

        for (const name of [
            'src/animal.ts',
            'src/ChatColumn.tsx',
            'src/Heading.tsx',
            'src/squirrel.ts',
        ]) {
            const item = await workspace.loadContextItem(name)
            // Trim content to the first 20 lines to imitate our context-fetching, which only includes file chunks
            item.content = item.content?.split('\n').slice(0, 20).join('\n')
            mockContextItems.push(item)
        }
    }, 20_000)

    beforeEach(async () => {
        await client.request('testing/reset', null)
    })

    const animalUri = workspace.file('src', 'animal.ts')
    const squirrelUri = workspace.file('src', 'squirrel.ts')

    async function setChatModel(model = 'google::v1::gemini-1.5-pro-002'): Promise<string> {
        // Use the same chat model regardless of the server response (in case it changes on the
        // remote endpoint so we don't need to regenerate all the recordings).
        const freshChatID = await client.request('chat/new', null)
        await client.request('chat/setModel', {
            id: freshChatID,
            model,
        })
        return freshChatID
    }

    it('extensionConfiguration/change & chat/models (handle errors)', async () => {
        // Send two config change notifications because this is what the
        // JetBrains client does and there was a bug where everything worked
        // fine as long as we didn't send the second unauthenticated config
        // change.
        const initModelName = 'anthropic::2024-10-22::claude-sonnet-4-latest'
        const { models } = await client.request('chat/models', { modelUsage: ModelUsage.Chat })
        expect(models[0].model.id).toStrictEqual(initModelName)

        const invalid = await client.request('extensionConfiguration/change', {
            ...client.info.extensionConfiguration,
            // Redacted format of an invalid access token (just random string). Tests fail in replay mode
            // if we don't use the redacted format here.
            accessToken: 'REDACTED_0ba08837494d00e3943c46999589eb29a210ba8063f084fff511c8e4d1503909',
            serverEndpoint: 'https://demo.sourcegraph.com/',
            customHeaders: {},
        })
        expect(invalid?.authenticated).toBeFalsy()
        const invalidModels = await client.request('chat/models', { modelUsage: ModelUsage.Chat })
        const remoteInvalidModels = invalidModels.models.filter(
            ({ model }) => model.provider !== 'Ollama'
        )
        expect(remoteInvalidModels).toStrictEqual([])

        const valid = await client.request('extensionConfiguration/change', {
            ...client.info.extensionConfiguration,
            accessToken: client.info.extensionConfiguration?.accessToken ?? 'invalid',
            serverEndpoint: client.info.extensionConfiguration?.serverEndpoint ?? DOTCOM_URL.toString(),
            customHeaders: {},
        })
        expect(valid?.status).toEqual('authenticated')
        if (valid?.status !== 'authenticated') {
            throw new Error('unreachable')
        }

        const reauthenticatedModels = await client.request('chat/models', {
            modelUsage: ModelUsage.Chat,
        })
        expect(reauthenticatedModels.models).not.toStrictEqual([])
        expect(reauthenticatedModels.models[0].model.id).toStrictEqual(initModelName)

        // Please don't update the recordings to use a different account without consulting #team-cody-core.
        // When changing an account, you also need to update the REDACTED_ hash above.
        //
        // To update the recordings with the correct account, run the following command
        // from the root of this repository:
        //
        //    source agent/scripts/export-cody-http-recording-tokens.sh
        //
        // If you don't have access to this private file then you need to ask
        expect(valid.username).toStrictEqual('codytesting')

        // telemetry assertion, to validate the expected events fired during the test run
        // Do not remove this assertion, and instead update the expectedEvents list above
        expect(await exportedTelemetryEvents(client)).toEqual(
            expect.arrayContaining(['cody.auth:connected', 'cody.auth.login:firstEver'])
        )
    }, 10_000)

    describe('Chat', () => {
        it('chat/submitMessage (short message)', async () => {
            await setChatModel('anthropic::2024-10-22::claude-3-5-sonnet-latest')
            const lastMessage = await client.sendSingleMessageToNewChat('Hello!')
            expect(lastMessage).toMatchSnapshot()
            // telemetry assertion, to validate the expected events fired during the test run
            // Do not remove this assertion, and instead update the expectedEvents list above
            expect(await exportedTelemetryEvents(client)).toEqual(
                expect.arrayContaining([
                    'cody.chat-question:submitted',
                    'cody.chat-question:executed',
                    'cody.chatResponse:noCode',
                ])
            )
        }, 30_000)

        it('chat/submitMessage (long message)', async () => {
            const lastMessage = await client.sendSingleMessageToNewChat(
                'Generate simple hello world function in java!'
            )
            const trimmedMessage = trimEndOfLine(lastMessage?.text ?? '')
            expect(trimmedMessage).toMatchSnapshot()
            // telemetry assertion, to validate the expected events fired during the test run
            // Do not remove this assertion, and instead update the expectedEvents list above
            expect(await exportedTelemetryEvents(client)).toEqual(
                expect.arrayContaining([
                    'cody.chat-question:submitted',
                    'cody.chat-question:executed',
                    'cody.chatResponse:hasCode',
                ])
            )
        }, 30_000)

        it('chat/import allows importing a chat transcript from an external source', async () => {
            const toChatExportResult = (transcript: SerializedChatTranscript): ChatExportResult => ({
                chatID: transcript.id,
                transcript: transcript,
            })
            const auth = await client.request('extensionConfiguration/status', null)
            expect(auth?.status).toEqual('authenticated')
            if (auth?.status !== 'authenticated') {
                throw new Error('unreachable')
            }

            const transcript1: SerializedChatTranscript = {
                id: 'transcript1',
                interactions: [
                    {
                        humanMessage: {
                            speaker: 'human',
                            text: 'Hello, Cody!',
                        },
                        assistantMessage: {
                            speaker: 'assistant',
                            text: 'Hello! How can I assist you today?',
                        },
                    },
                    {
                        humanMessage: {
                            speaker: 'human',
                            text: 'Can you help me with my code?',
                        },
                        assistantMessage: {
                            speaker: 'assistant',
                            text: 'Of course! What do you need help with?',
                        },
                    },
                ],
                lastInteractionTimestamp: '2023-10-01T12:00:00Z',
            }

            const transcript2: SerializedChatTranscript = {
                id: 'transcript2',
                interactions: [
                    {
                        humanMessage: {
                            speaker: 'human',
                            text: 'My name is Lars Monsen.',
                        },
                        assistantMessage: {
                            speaker: 'assistant',
                            text: 'Lovely to meet you, Lars.',
                        },
                    },
                ],
                lastInteractionTimestamp: '2023-10-02T08:30:00Z',
            }

            const transcript3: SerializedChatTranscript = {
                id: 'transcript3',
                chatTitle: 'Debugging Session',
                interactions: [
                    {
                        humanMessage: {
                            speaker: 'human',
                            text: 'My name is Bear Grylls.',
                        },
                        assistantMessage: {
                            speaker: 'assistant',
                            text: 'Nice to meet you, Bear.',
                        },
                    },
                ],
                lastInteractionTimestamp: '2023-10-03T14:45:00Z',
            }

            // The history we are importing contains two transcripts from the same user and one from a different user.
            // when we do an export, we should only get the transcript from the currently logged in user
            const history: Record<string, Record<string, SerializedChatTranscript>> = {
                [`${auth.endpoint}-${auth.username}`]: {
                    [transcript1.id]: transcript1,
                    [transcript2.id]: transcript2,
                },
                someOtherUser: {
                    [transcript3.id]: transcript3,
                },
            }

            await client.request('chat/import', { history, merge: true })
            const exported = await client.request('chat/export', null)
            const expected: ChatExportResult[] = [
                toChatExportResult(transcript1),
                toChatExportResult(transcript2),
            ]

            expect(exported).toEqual(expected)
        })

        it('chat/submitMessage (with mock context)', async () => {
            await client.openFile(animalUri)
            const lastMessage = await client.sendSingleMessageToNewChat(
                'Write a class Dog that implements the Animal interface in my workspace. Show the code only, no explanation needed.',
                {
                    contextFiles: mockContextItems,
                }
            )
            // TODO: make this test return a TypeScript implementation of
            // `animal.ts`. It currently doesn't do this because the workspace root
            // is not a git directory and symf reports some git-related error.
            expect(trimEndOfLine(lastMessage?.text ?? '')).toMatchSnapshot()
            // telemetry assertion, to validate the expected events fired during the test run
            // Do not remove this assertion, and instead update the expectedEvents list above
            expect(await exportedTelemetryEvents(client)).toEqual(
                expect.arrayContaining([
                    'cody.chat-question:submitted',
                    'cody.chat-question:executed',
                    'cody.chatResponse:hasCode',
                ])
            )
        }, 30_000)

        it('chat/submitMessage (squirrel test)', async () => {
            await client.openFile(squirrelUri)
            const { lastMessage, transcript } =
                await client.sendSingleMessageToNewChatWithFullTranscript(
                    // Emphasize showing code examples to hit on `chatResponse:hasCode` event.
                    'What is Squirrel? Show me concrete code examples',
                    {
                        contextFiles: mockContextItems,
                    }
                )
            expect(lastMessage?.text?.toLocaleLowerCase() ?? '').includes('code nav')
            expect(lastMessage?.text?.toLocaleLowerCase() ?? '').includes('sourcegraph')
            decodeURIs(transcript)
            const contextFiles = transcript.messages.flatMap(m => m.contextFiles ?? [])
            expect(contextFiles).not.toHaveLength(0)
            expect(contextFiles.map(file => file.uri.toString())).includes(squirrelUri.toString())
            // telemetry assertion, to validate the expected events fired during the test run
            // Do not remove this assertion, and instead update the expectedEvents list above
            expect(await exportedTelemetryEvents(client)).toEqual(
                expect.arrayContaining([
                    'cody.chat-question:submitted',
                    'cody.chat-question:executed',
                    'cody.chatResponse:hasCode',
                ])
            )
        }, 30_000)

        it('webview/receiveMessage (type: chatModel)', async () => {
            const id = await client.request('chat/new', null)
            {
                await client.request('chat/setModel', { id, model: 'google::v1::gemini-1.5-pro-002' })
                const lastMessage = await client.sendMessage(id, 'what color is the sky?')
                expect(lastMessage?.text?.toLocaleLowerCase().includes('blue')).toBeTruthy()
            }
            // telemetry assertion, to validate the expected events fired during the test run
            // Do not remove this assertion, and instead update the expectedEvents list above
            expect(await exportedTelemetryEvents(client)).toEqual(
                expect.arrayContaining([
                    'cody.chat-question:submitted',
                    'cody.chat-question:executed',
                    'cody.chatResponse:noCode',
                ])
            )
        }, 30_000)

        it('webview/receiveMessage (type: reset)', async () => {
            const id = await client.request('chat/new', null)
            await client.request('chat/setModel', {
                id,
                model: 'google::v1::gemini-1.5-pro-002',
            })
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
            // telemetry assertion, to validate the expected events fired during the test run
            // Do not remove this assertion, and instead update the expectedEvents list above
            expect(await exportedTelemetryEvents(client)).toEqual(
                expect.arrayContaining([
                    'cody.chat-question:submitted',
                    'cody.chat-question:executed',
                    'cody.chatResponse:noCode',
                    'cody.chat-question:submitted',
                    'cody.chat-question:executed',
                    'cody.chatResponse:noCode',
                    'cody.chat-question:submitted',
                    'cody.chat-question:executed',
                    'cody.chatResponse:noCode',
                ])
            )
        }, 30_000)

        describe('chat/editMessage', () => {
            it(
                'edits the last human chat message',
                async () => {
                    const id = await client.request('chat/new', null)
                    await client.request('chat/setModel', {
                        id,
                        model: 'google::v1::gemini-1.5-pro-002',
                    })
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
                    // telemetry assertion, to validate the expected events fired during the test run
                    // Do not remove this assertion, and instead update the expectedEvents list above
                    expect(await exportedTelemetryEvents(client)).toEqual(
                        expect.arrayContaining([
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
                        ])
                    )
                },
                { timeout: mayRecord ? 10_000 : 5000 }
            )

            it('edits messages by index', async () => {
                const id = await client.request('chat/new', null)
                await client.request('chat/setModel', {
                    id,
                    model: 'google::v1::gemini-1.5-pro-002',
                })
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
                // telemetry assertion, to validate the expected events fired during the test run
                // Do not remove this assertion, and instead update the expectedEvents list above
                expect(await exportedTelemetryEvents(client)).toEqual(
                    expect.arrayContaining([
                        'cody.chat-question:submitted',
                        'cody.chat-question:executed',
                        'cody.editChatButton:clicked',
                    ])
                )
            }, 30_000)
        })
    })

    describe('Commands', () => {
        it('commands/explain', async () => {
            await client.openFile(animalUri)
            const freshChatID = await setChatModel()
            const id = await client.request('commands/explain', null)

            // Assert that the server is not using IDs between `chat/new` and
            // `chat/explain`. In VS Code, we try to reuse empty webview panels,
            // which is undesirable for agent clients.
            expect(id).not.toStrictEqual(freshChatID)

            const lastMessage = await client.firstNonEmptyTranscript(id)
            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchSnapshot()
            // telemetry assertion, to validate the expected events fired during the test run
            // Do not remove this assertion, and instead update the expectedEvents list above
            expect(await exportedTelemetryEvents(client)).toEqual(
                expect.arrayContaining([
                    'cody.command.explain:executed',
                    'cody.chat-question:submitted',
                    'cody.experiment.promptCachingOnMessages:enrolled',
                    'cody.chat-question:executed',
                    // Do not look for has code as not all answers explains with code snippet
                    // 'cody.chatResponse:hasCode',
                ])
            )
        }, 30_000)

        it('commands/smell', async () => {
            await client.openFile(animalUri)
            await setChatModel()
            const id = await client.request('commands/smell', null)
            const lastMessage = await client.firstNonEmptyTranscript(id)

            expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchSnapshot()
            // telemetry assertion, to validate the expected events fired during the test run
            // Do not remove this assertion, and instead update the expectedEvents list above
            expect(await exportedTelemetryEvents(client)).toEqual(
                expect.arrayContaining([
                    'cody.command.smell:executed',
                    'cody.chat-question:submitted',
                    'cody.experiment.promptCachingOnMessages:enrolled',
                    'cody.chat-question:executed',
                    // Do not look for has code as not all answers explains with code snippet
                    // 'cody.chatResponse:hasCode',
                ])
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
            // telemetry assertion, to validate the expected events fired during the test run
            // Do not remove this assertion, and instead update the expectedEvents list above
            expect(await exportedTelemetryEvents(client)).toEqual(expect.arrayContaining([]))
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
            // telemetry assertion, to validate the expected events fired during the test run
            // Do not remove this assertion, and instead update the expectedEvents list above
            expect(await exportedTelemetryEvents(client)).toEqual(expect.arrayContaining([]))
        })
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.shutdownAndExit()
        // Long timeout because to allow Polly.js to persist HTTP recordings
    }, 30_000)
})
