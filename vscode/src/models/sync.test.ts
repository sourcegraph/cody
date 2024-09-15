import {
    AUTH_STATUS_FIXTURE_AUTHED,
    AUTH_STATUS_FIXTURE_UNAUTHED,
    type AuthenticatedAuthStatus,
    ClientConfigSingleton,
    DOTCOM_URL,
    type GraphQLAPIClientConfig,
    Model,
    ModelTag,
    ModelUsage,
    RestClient,
    type ServerModel,
    type ServerModelConfiguration,
    featureFlagProvider,
    getDotComDefaultModels,
    graphqlClient,
    mockAuthStatus,
    modelsService,
} from '@sourcegraph/cody-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localStorage } from '../services/LocalStorageProvider'
import { secretStorage } from '../services/SecretStorageProvider'
import { maybeAdjustContextWindows, syncModels } from './sync'
import { getEnterpriseContextWindow } from './utils'

vi.mock('graphqlClient')
vi.mock('../services/LocalStorageProvider')

describe('syncModels', () => {
    const setModelsSpy = vi.spyOn(modelsService, 'setModels')

    beforeEach(() => {
        setModelsSpy.mockClear()
        mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)

        vi.spyOn(featureFlagProvider, 'evaluateFeatureFlag').mockResolvedValue(false)

        // Mock the /.api/client-config for these tests so that modelsAPIEnabled == false
        vi.spyOn(ClientConfigSingleton.prototype, 'getConfig').mockResolvedValue({
            chatEnabled: true,
            autoCompleteEnabled: true,
            customCommandsEnabled: true,
            attributionEnabled: true,
            smartContextWindowEnabled: true,
            modelsAPIEnabled: false,
        })
    })
    afterEach(() => {
        // SUPER IMPORTANT: We need to call restoreAllMocks (instead of resetAllMocks)
        // because we hook into the global state that will impact other states.
        // Normally this isn't an issue, but here, we don't want our mock/spy that enables
        // server-side LLM config to leak out of this describe block.
        vi.restoreAllMocks()
    })

    it('does not register models if not authenticated', async () => {
        await syncModels(AUTH_STATUS_FIXTURE_UNAUTHED)
        expect(setModelsSpy).toHaveBeenCalledWith([])
    })

    it('sets dotcom default models if on dotcom', async () => {
        // @ts-ignore
        graphqlClient._config = {
            serverEndpoint: DOTCOM_URL.toString(),
        } as Partial<GraphQLAPIClientConfig> as GraphQLAPIClientConfig
        localStorage.set('mock', '1')
        await syncModels({ ...AUTH_STATUS_FIXTURE_AUTHED, endpoint: DOTCOM_URL.toString() })
        expect(setModelsSpy).toHaveBeenCalledWith(getDotComDefaultModels())
    })

    it('sets no models if the enterprise instance does not have Cody enabled', async () => {
        await syncModels({ ...AUTH_STATUS_FIXTURE_AUTHED, endpoint: 'https://example.com' })
        expect(setModelsSpy).toHaveBeenCalledWith([])
    })

    it('sets enterprise context window model if chatModel config overwrite exists', async () => {
        const chatModel = 'custom-model'
        const authStatus: AuthenticatedAuthStatus = {
            ...AUTH_STATUS_FIXTURE_AUTHED,
            authenticated: true,
            endpoint: 'https://example.com',
            configOverwrites: { chatModel },
        }

        await syncModels(authStatus)

        // i.e. this gets the one and only chat model from the Sourcegraph instance.
        expect(setModelsSpy).not.toHaveBeenCalledWith(getDotComDefaultModels())
        expect(setModelsSpy).toHaveBeenCalledWith([
            new Model({
                id: authStatus.configOverwrites!.chatModel!,
                usage: [ModelUsage.Chat, ModelUsage.Edit],
                contextWindow: getEnterpriseContextWindow(chatModel, authStatus.configOverwrites!),
                tags: [ModelTag.Enterprise],
            }),
        ])
    })
})

// Tests specific to how `syncModels` operates when the VS Code instance is
// configured to fetch models from the Sourcegraph backend.
describe('syncModels from the server', () => {
    const testEndpoint = 'https://sourcegraph.acme-corp.com'
    const testUserCreds = 'hunter2'
    const testServerSideModels: ServerModel[] = [
        {
            modelName: 'test-model',
            displayName: 'test model',
            modelRef: 'a::a::a',
            contextWindow: { maxInputTokens: 1024, maxOutputTokens: 1024 },
            capabilities: [],
        } as Partial<ServerModel> as ServerModel,
    ]

    // Unlike the other mocks, we define setModelsSpy here so that it can
    // be referenced by individual tests. (But like the other spys, it needs
    // to be reset/restored after each test.)
    let setModelsSpy = vi.spyOn(modelsService, 'setModels')

    beforeEach(() => {
        setModelsSpy = vi.spyOn(modelsService, 'setModels')

        // Mock the /.api/client-config for these tests so that modelsAPIEnabled == true
        const mockClientConfig = {
            chatEnabled: true,
            autoCompleteEnabled: true,
            customCommandsEnabled: true,
            attributionEnabled: true,
            smartContextWindowEnabled: true,
            modelsAPIEnabled: true,
        }
        vi.spyOn(ClientConfigSingleton.prototype, 'getConfig').mockResolvedValue(mockClientConfig)

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
        const getAvailableModelsSpy = vi.spyOn(RestClient.prototype, 'getAvailableModels')
        getAvailableModelsSpy.mockImplementation(() =>
            Promise.resolve({
                models: testServerSideModels,
                defaultModels: { chat: 'a::a::a', fastChat: 'a::a::a', codeCompletion: 'a::a::a' },
                providers: [],
                revision: '1',
                schemaVersion: '1',
            } satisfies ServerModelConfiguration)
        )
    })
    afterEach(() => {
        // SUPER IMPORTANT: We need to call restoreAllMocks (instead of resetAllMocks)
        // because we hook into the global state that will impact other states.
        // Normally this isn't an issue, but here, we don't want our mock/spy that enables
        // server-side LLM config to leak out of this describe block.
        vi.restoreAllMocks()
    })

    // Cody Web can be run without access token since it relies on cookie auth info
    // skip this tests since these checks have been removed to make Cody Web working
    it.skip('throws if no creds are available', async () => {
        await expect(async () => {
            await syncModels({
                ...AUTH_STATUS_FIXTURE_AUTHED,
                authenticated: true,
                // Our mock for secretStorage will only return a user access token if
                // the endpoint matches what is expected.
                endpoint: 'something other than testEndpoint',
            })
        }).rejects.toThrowError('no userAccessToken available. Unable to fetch models.')
    })

    it('works', async () => {
        await syncModels({
            ...AUTH_STATUS_FIXTURE_AUTHED,
            authenticated: true,
            endpoint: testEndpoint,
        })
        expect(setModelsSpy).toHaveBeenCalledWith(testServerSideModels.map(Model.fromApi))
    })
})

describe('maybeAdjustContextWindows', () => {
    it('works', () => {
        const defaultMaxInputTokens = 8192
        /**
         * {@link defaultMaxInputTokens} * 0.85
         * Max input token count adjustment comapred to the default OpenAI tokenizer
         * (see {@link maybeAdjustContextWindows} implementation).
         */
        const mistralAdjustedMaxInputTokens = 6963
        const contextWindow = {
            maxInputTokens: defaultMaxInputTokens,
            maxOutputTokens: 4096,
        }
        const testServerSideModels = [
            {
                modelRef: 'fireworks::v1::deepseek-coder-v2-lite-base',
                displayName: '(Fireworks) DeepSeek V2 Lite Base',
                modelName: 'deepseek-coder-v2-lite-base',
                capabilities: ['autocomplete'],
                category: ModelTag.Balanced,
                status: 'stable',
                tier: ModelTag.Enterprise,
                contextWindow,
            } satisfies ServerModel,
            {
                modelRef: 'fireworks::v1::mixtral-8x7b-instruct',
                displayName: '(Fireworks) Mixtral 8x7b Instruct',
                modelName: 'mixtral-8x7b-instruct',
                capabilities: ['chat', 'autocomplete'],
                category: ModelTag.Balanced,
                status: 'stable',
                tier: ModelTag.Enterprise,
                contextWindow,
            } satisfies ServerModel,
            {
                modelRef: 'fireworks::v1::mixtral-8x22b-instruct',
                displayName: '(Fireworks) Mixtral 8x22b Instruct',
                modelName: 'mixtral-8x22b-instruct',
                capabilities: ['chat', 'autocomplete'],
                category: ModelTag.Balanced,
                status: 'stable',
                tier: ModelTag.Enterprise,
                contextWindow,
            } satisfies ServerModel,
            {
                modelRef: 'fireworks::v1::starcoder-16b',
                displayName: '(Fireworks) Starcoder 16B',
                modelName: 'starcoder-16b',
                capabilities: ['autocomplete'],
                category: ModelTag.Balanced,
                status: 'stable',
                tier: ModelTag.Enterprise,
                contextWindow,
            } satisfies ServerModel,
            {
                modelRef: 'fireworks::v1::mistral-large-latest',
                displayName: '(Mistral API) Mistral Large',
                modelName: 'mistral-large-latest',
                capabilities: ['chat'],
                category: ModelTag.Balanced,
                status: 'stable',
                tier: ModelTag.Enterprise,
                contextWindow,
            } satisfies ServerModel,
            {
                modelRef: 'fireworks::v1::llama-v3p1-70b-instruct',
                displayName: '(Fireworks) Llama 3.1 70B Instruct',
                modelName: 'llama-v3p1-70b-instruct',
                capabilities: ['chat'],
                category: ModelTag.Balanced,
                status: 'stable',
                tier: ModelTag.Enterprise,
                contextWindow,
            } satisfies ServerModel,
        ]

        const results = maybeAdjustContextWindows(testServerSideModels)
        const mistralModelNamePrefixes = ['mistral', 'mixtral']
        for (const model of results) {
            let wantMaxInputTokens = defaultMaxInputTokens
            if (mistralModelNamePrefixes.some(p => model.modelName.startsWith(p))) {
                wantMaxInputTokens = mistralAdjustedMaxInputTokens
            }
            expect(model.contextWindow.maxInputTokens).toBe(wantMaxInputTokens)
        }
    })
})
