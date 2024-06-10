import {
    Model,
    ModelUsage,
    ModelsService,
    RestClient,
    defaultAuthStatus,
    getDotComDefaultModels,
    unauthenticatedStatus,
} from '@sourcegraph/cody-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { secretStorage } from '../services/SecretStorageProvider'
import { syncModels } from './sync'
import { getEnterpriseContextWindow } from './utils'

describe('syncModels', () => {
    const setModelsSpy = vi.spyOn(ModelsService, 'setModels')

    beforeEach(() => {
        setModelsSpy.mockClear()
    })

    // This test just confirms the environment is in the expected state.
    it('should not have the userServerDefinedModels config setting enabled', async () => {
        const codyConfig = vscode.workspace.getConfiguration('cody')
        if (codyConfig) {
            const setting = codyConfig.get<boolean>('dev.useServerDefinedModels')
            expect(setting).to.be.undefined
        }
    })

    it('does not register models if not authenticated', async () => {
        await syncModels(unauthenticatedStatus)
        expect(setModelsSpy).toHaveBeenCalledWith([])
    })

    it('sets dotcom default models if on dotcom', async () => {
        const authStatus = { ...defaultAuthStatus, isDotCom: true, authenticated: true }

        await syncModels(authStatus)
        expect(setModelsSpy).toHaveBeenCalledWith(getDotComDefaultModels())
    })

    it('sets no models if the enterprise instance does not have Cody enabled', async () => {
        const authStatus = { ...defaultAuthStatus, isDotCom: false, authenticated: true }

        await syncModels(authStatus)
        expect(setModelsSpy).toHaveBeenCalledWith([])
    })

    it('sets enterprise context window model if chatModel config overwrite exists', async () => {
        const chatModel = 'custom-model'
        const authStatus = {
            ...defaultAuthStatus,
            authenticated: true,
            isDotCom: false,
            configOverwrites: { chatModel },
        }

        await syncModels(authStatus)

        // i.e. this gets the one and only chat model from the Sourcegraph instance.
        expect(setModelsSpy).not.toHaveBeenCalledWith(getDotComDefaultModels())
        expect(setModelsSpy).toHaveBeenCalledWith([
            new Model(
                authStatus.configOverwrites.chatModel,
                [ModelUsage.Chat, ModelUsage.Edit],
                getEnterpriseContextWindow(chatModel, authStatus.configOverwrites)
            ),
        ])
    })
})

// Tests specific to how `syncModels` operates when the VS Code instance is
// configured to fetch models from the Sourcegraph backend.
describe('syncModels from the server', () => {
    const testEndpoint = 'https://sourcegraph.acme-corp.com'
    const testUserCreds = 'hunter2'
    const testServerSideModels: Model[] = getDotComDefaultModels()

    // Unlike the other mocks, we define setModelsSpy here so that it can
    // be referenced by individual tests. (But like the other spys, it needs
    // to be reset/restored after each test.)
    let setModelsSpy = vi.spyOn(ModelsService, 'setModels')

    beforeEach(() => {
        setModelsSpy = vi.spyOn(ModelsService, 'setModels')

        // Assuming we are looking up the "cody.dev.useServerDefinedModels",
        // and just returning true.
        const getConfigSpy = vi.spyOn(vscode.workspace, 'getConfiguration')
        getConfigSpy.mockImplementation((unused1, unused2) => ({
            get: vi.fn(() => true),
            has: vi.fn(() => true),
            inspect: vi.fn(() => ({ key: 'key' })),
            update: vi.fn(() => Promise.resolve()),
        }))

        // Mock the secretStorage to return user creds IFF it is for `testEndpoint`.
        const getTokenSpy = vi.spyOn(secretStorage, 'getToken')
        getTokenSpy.mockImplementation(async (endpoint): Promise<string | undefined> => {
            if (endpoint === testEndpoint) {
                return testUserCreds
            }
            return undefined
        })

        // Attach our mock to the RestClient's prototype. So the class will get instantiated
        // like normal, but any instance will use our mock implementation.
        const getAvaialbleModelsSpy = vi.spyOn(RestClient.prototype, 'getAvailableModels')
        getAvaialbleModelsSpy.mockImplementation(async (): Promise<Model[]> => {
            return testServerSideModels
        })
    })
    afterEach(() => {
        // SUPER IMPORTANT: We need to call restoreAllMocks (instead of resetAllMocks)
        // because we hook into the global state that will impact other states.
        // Normally this isn't an issue, but here, we don't want our mock/spy that enables
        // server-side LLM config to leak out of this describe block.
        vi.restoreAllMocks()
    })

    it('throws if no creds are available', async () => {
        await expect(async () => {
            const authStatus = {
                ...defaultAuthStatus,
                authenticated: true,
                // Our mock for secretStorage will only return a user access token if
                // the endpoint matches what is expected.
                endpoint: 'something other than testEndpoint',
            }
            await syncModels(authStatus)
        }).rejects.toThrowError('no userAccessToken available. Unable to fetch models.')
    })

    it('works', async () => {
        const authStatus = {
            ...defaultAuthStatus,
            authenticated: true,
            endpoint: testEndpoint,
        }
        await syncModels(authStatus)
        expect(setModelsSpy).toHaveBeenCalledWith(testServerSideModels)
    })
})
