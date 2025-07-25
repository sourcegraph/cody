import path from 'node:path'
import { ModelTag, ModelUsage, toModelRefStr } from '@sourcegraph/cody-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
    TESTING_CREDENTIALS,
    type TestingCredentials,
} from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'

describe(
    'Auth',
    {
        timeout: 5000,
        // Repeat to find race conditions. Set to 0 when recording for faster execution.
        repeats: process.env.CODY_RECORDING_MODE ? 0 : 10,
    },
    () => {
        const INITIAL_CREDENTIALS: TestingCredentials = TESTING_CREDENTIALS.enterprise
        const INVALID_CREDENTIALS: TestingCredentials = {
            serverEndpoint: INITIAL_CREDENTIALS.serverEndpoint,
            redactedToken: 'sgp_INVALIDACCESSTOK_ENTHISSHOULDFAILEEEEEEEEEEEEEEEEEEEEEEE2',
        }
        const SWITCH_CREDENTIALS: TestingCredentials = {
            ...TESTING_CREDENTIALS.s2,
        }
        const FIXTURE_MODELS = {
            // Set this to the default chat model on S2. (It's OK if it's the same as
            // dotcomDefaultChatModel.)
            defaultS2ChatModel: 'anthropic::2024-10-22::claude-sonnet-4-latest',

            // Set this to 2 model IDs that both (1) exist on S2 but (2) are NOT the same as
            // defaultS2ChatModel.
            differentFromS2DefaultChatModel: [
                'anthropic::2024-10-22::claude-3-5-haiku-latest',
                'google::v1::gemini-1.5-pro-002',
            ],
        }

        const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'auth'))
        const client = TestClient.create({
            workspaceRootUri: workspace.rootUri,
            name: 'auth',
            credentials: INITIAL_CREDENTIALS,
        })

        beforeAll(async () => {
            await workspace.beforeAll()
            await client.beforeAll()
        })

        afterAll(async () => {
            await workspace.afterAll()
            await client.afterAll()
        })

        it('authenticated successfully using initial credentials', async () => {
            const authStatus = await client.request('extensionConfiguration/status', null)
            expect(authStatus?.authenticated).toBe(true)
            expect(authStatus?.endpoint).toBe(INITIAL_CREDENTIALS.serverEndpoint)
        })

        it('fails to authenticate using invalid credentials', async () => {
            // Authenticate with valid credentials so we have a consistent starting point for this
            // test. It is important to do this even if the preceding test does it because we might
            // not be running the prior tests or we might be running with `repeats > 0`.
            const preAuthStatus = await client.request('extensionConfiguration/change', {
                ...client.info.extensionConfiguration,
                serverEndpoint: INITIAL_CREDENTIALS.serverEndpoint,
                accessToken: INITIAL_CREDENTIALS.token ?? INITIAL_CREDENTIALS.redactedToken,
                customHeaders: {},
            })
            expect(preAuthStatus?.authenticated).toBe(true)
            expect(preAuthStatus?.endpoint).toBe(INITIAL_CREDENTIALS.serverEndpoint)

            // Start a new chat *before* our authentication becomes invalid, so we can test that it is
            // not usable after our authentication becomes invalid.
            const preChatID = await client.request('chat/new', null)
            await client.request('chat/setModel', {
                id: preChatID,
                model: FIXTURE_MODELS.differentFromS2DefaultChatModel[0],
            })

            const authStatus = await client.request('extensionConfiguration/change', {
                ...client.info.extensionConfiguration,
                serverEndpoint: INVALID_CREDENTIALS.serverEndpoint,
                accessToken: INVALID_CREDENTIALS.token ?? INVALID_CREDENTIALS.redactedToken,
                customHeaders: {},
            })
            expect(authStatus?.authenticated).toBeFalsy()

            // Test things that should fail when not authenticated.

            // The chat we started before our invalid authentication should not be usable.
            await expect(
                client.request('chat/setModel', {
                    id: preChatID,
                    model: FIXTURE_MODELS.differentFromS2DefaultChatModel[1],
                })
            ).rejects.toThrowError(`No panel with ID ${preChatID}`)
            await expect(
                client.sendMessage(preChatID, 'hello on existing chat with invalid credentials')
            ).rejects.toThrowError(`No panel with ID ${preChatID}`)

            // Creating a new chat fails when not authenticated.
            await expect(client.request('chat/new', null)).rejects.toThrowError('Not authenticated')

            // Listing models should yield empty when not authenticated.
            const { models } = await client.request('chat/models', { modelUsage: ModelUsage.Chat })
            expect(models).toStrictEqual<typeof models>([])
        })

        it('re-authenticates using valid initial credentials', async () => {
            const authStatus = await client.request('extensionConfiguration/change', {
                ...client.info.extensionConfiguration,
                accessToken: INITIAL_CREDENTIALS.token ?? INITIAL_CREDENTIALS.redactedToken,
                serverEndpoint: INITIAL_CREDENTIALS.serverEndpoint,
                customHeaders: {},
            })
            expect(authStatus?.authenticated).toBe(true)
            expect(authStatus?.endpoint).toBe(INITIAL_CREDENTIALS.serverEndpoint)

            // Test things that should work when re-authenticated.

            // Chats should work, and it should use the default model.
            const chat = await client.sendSingleMessageToNewChatWithFullTranscript(
                'hello after reauthentication'
            )
            expect(chat.lastMessage?.model).toBe(FIXTURE_MODELS.differentFromS2DefaultChatModel[0])
            expect(chat.lastMessage?.error).toBe(undefined)

            // Listing models should work.
            const { models } = await client.request('chat/models', { modelUsage: ModelUsage.Chat })
            expect(models.length).toBeGreaterThanOrEqual(2)
            expect(models.map(({ model }) => model.id)).toContain('openai::2024-02-01::gpt-4o') // arbitrary model that we expect to be included
        })

        it.skip('switches to a different account', async () => {
            // Re-authenticate to a different endpoint so we can switch from it. It is important to
            // do this even if the preceding test does it because we might not be running the prior
            // tests or we might be running with `repeats > 0`.
            const preAuthStatus = await client.request('extensionConfiguration/change', {
                ...client.info.extensionConfiguration,
                accessToken: INITIAL_CREDENTIALS.token ?? INITIAL_CREDENTIALS.redactedToken,
                serverEndpoint: INITIAL_CREDENTIALS.serverEndpoint,
                customHeaders: {},
            })
            expect(preAuthStatus?.authenticated).toBe(true)
            expect(preAuthStatus?.endpoint).toBe(INITIAL_CREDENTIALS.serverEndpoint)

            const dotcomModels = await client.request('chat/models', { modelUsage: ModelUsage.Chat })
            expect(dotcomModels?.models?.length).toBeGreaterThanOrEqual(1)

            // Before switching, set a chat model as default on the prior endpoint. We want it to NOT be
            // carried over to the endpoint we switch to.
            const preChatID = await client.request('chat/new', null)
            await client.request('chat/setModel', {
                id: preChatID,
                model: FIXTURE_MODELS.differentFromS2DefaultChatModel[0],
            })

            const authStatus = await client.request('extensionConfiguration/change', {
                ...client.info.extensionConfiguration,
                accessToken: SWITCH_CREDENTIALS.token ?? SWITCH_CREDENTIALS.redactedToken,
                serverEndpoint: SWITCH_CREDENTIALS.serverEndpoint,
                customHeaders: {},
            })
            expect(authStatus?.authenticated).toBe(true)
            expect(authStatus?.endpoint).toBe(SWITCH_CREDENTIALS.serverEndpoint)

            // Test things that should work after having switched accounts.

            // Enterprise models should not contain models with the waitlist tag.
            const enterpriseModels = await client.request('chat/models', {
                modelUsage: ModelUsage.Chat,
            })
            expect(
                enterpriseModels.models?.some(({ model }) => model.tags.includes(ModelTag.Waitlist))
            ).toBeFalsy()

            // The chat that we started before switching accounts should not be usable from the new
            // account.
            await expect(
                client.sendSingleMessageToNewChatWithFullTranscript(
                    'hello on existing chat after switching accounts',
                    { id: preChatID }
                )
            ).rejects.toThrow(`No panel with ID ${preChatID}`)
            // Chats should work, and it should use the default model.
            const chat = await client.sendSingleMessageToNewChatWithFullTranscript(
                'hello after switching accounts'
            )

            expect(chat.lastMessage?.model).toBe(FIXTURE_MODELS.defaultS2ChatModel)
            expect(chat.lastMessage?.error).toBeUndefined()

            // Listing models should work.
            const { models } = await client.request('chat/models', { modelUsage: ModelUsage.Chat })
            expect(models.length).toBeGreaterThanOrEqual(2)
            expect(models.map(({ model }) => toModelRefStr(model.modelRef!))).toContain(
                'openai::2024-02-01::gpt-4o' // arbitrary model that we expect to be included
            )
        })
    }
)
