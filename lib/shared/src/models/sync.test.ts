import { Observable, Subject } from 'observable-fns'
import { describe, expect, it, vi } from 'vitest'
import { mockAuthStatus } from '../auth/authStatus'
import { AUTH_STATUS_FIXTURE_AUTHED, type AuthStatus } from '../auth/types'
import { CLIENT_CAPABILITIES_FIXTURE, mockClientCapabilities } from '../configuration/clientCapabilities'
import type { ResolvedConfiguration } from '../configuration/resolver'
import { featureFlagProvider } from '../experimentation/FeatureFlagProvider'
import { FeatureFlag } from '../experimentation/FeatureFlagProvider'
import {
    firstValueFrom,
    readValuesFrom,
    shareReplay,
    testing__firstValueFromWithinTime,
} from '../misc/observable'
import { pendingOperation, skipPendingOperation } from '../misc/observableOperation'
import type { CodyClientConfig } from '../sourcegraph-api/clientConfig'
import { DOTCOM_URL } from '../sourcegraph-api/environments'
import type { CodyLLMSiteConfiguration } from '../sourcegraph-api/graphql/client'
import * as userProductSubscriptionModule from '../sourcegraph-api/userProductSubscription'
import type { PartialDeep } from '../utils'
import {
    type Model,
    type ServerModel,
    createModel,
    createModelFromServerModel,
    modelTier,
} from './model'
import {
    type ModelCategory,
    type ModelTier,
    type ModelsData,
    type ServerModelConfiguration,
    TestLocalStorageForModelPreferences,
    modelsService,
} from './modelsService'
import { maybeAdjustContextWindows, syncModels } from './sync'
import { ModelTag } from './tags'
import { ModelUsage } from './types'

vi.mock('graphqlClient')
vi.mock('../services/LocalStorageProvider')
vi.mock('../experimentation/FeatureFlagProvider')

// Returns true for all feature flags enabled during synctests.
vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(true))

mockClientCapabilities(CLIENT_CAPABILITIES_FIXTURE)

describe('server sent models', async () => {
    const serverOpus: ServerModel = {
        modelRef: 'anthropic::unknown::anthropic.claude-3-opus-20240229-v1_0',
        displayName: 'Opus',
        modelName: 'anthropic.claude-3-opus-20240229-v1_0',
        capabilities: ['chat'],
        category: 'balanced' as ModelCategory,
        status: 'stable',
        tier: 'enterprise' as ModelTier,
        contextWindow: {
            maxInputTokens: 9000,
            maxOutputTokens: 4000,
        },
    }
    const opus = createModelFromServerModel(serverOpus)

    const serverClaude: ServerModel = {
        modelRef: 'anthropic::unknown::anthropic.claude-instant-v1',
        displayName: 'Instant',
        modelName: 'anthropic.claude-instant-v1',
        capabilities: ['autocomplete'],
        category: 'balanced' as ModelCategory,
        status: 'stable',
        tier: 'enterprise' as ModelTier,
        contextWindow: {
            maxInputTokens: 9000,
            maxOutputTokens: 4000,
        },
    }
    const claude = createModelFromServerModel(serverClaude)

    const serverTitan: ServerModel = {
        modelRef: 'anthropic::unknown::amazon.titan-text-lite-v1',
        displayName: 'Titan',
        modelName: 'amazon.titan-text-lite-v1',
        capabilities: ['autocomplete', 'chat'],
        category: 'balanced' as ModelCategory,
        status: 'stable',
        tier: 'enterprise' as ModelTier,
        contextWindow: {
            maxInputTokens: 9000,
            maxOutputTokens: 4000,
        },
    }
    const titan = createModelFromServerModel(serverTitan)

    const SERVER_MODELS: ServerModelConfiguration = {
        schemaVersion: '1.0',
        revision: '-',
        providers: [],
        models: [serverOpus, serverClaude, serverTitan],
        defaultModels: {
            chat: serverOpus.modelRef,
            fastChat: serverTitan.modelRef,
            codeCompletion: serverClaude.modelRef,
        },
    }

    const mockFetchServerSideModels = vi.fn(() => Promise.resolve(SERVER_MODELS))
    vi.mocked(featureFlagProvider).evaluatedFeatureFlag.mockReturnValue(Observable.of(false))

    const result = await firstValueFrom(
        syncModels({
            resolvedConfig: Observable.of({
                auth: { serverEndpoint: AUTH_STATUS_FIXTURE_AUTHED.endpoint },
                configuration: {},
                clientState: { modelPreferences: {} },
            } satisfies PartialDeep<ResolvedConfiguration> as ResolvedConfiguration),
            authStatus: Observable.of(AUTH_STATUS_FIXTURE_AUTHED),
            configOverwrites: Observable.of(null),
            clientConfig: Observable.of({
                modelsAPIEnabled: true,
            } satisfies Partial<CodyClientConfig> as CodyClientConfig),
            fetchServerSideModels_: mockFetchServerSideModels,
            userProductSubscription: Observable.of({ userCanUpgrade: true }),
        }).pipe(skipPendingOperation())
    )
    const storage = new TestLocalStorageForModelPreferences()
    modelsService.setStorage(storage)
    mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)
    vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(Observable.of(result))

    it('constructs from server models', () => {
        expect(opus.id).toBe(serverOpus.modelRef)
        expect(opus.title).toBe(serverOpus.displayName)
        expect(opus.provider).toBe('anthropic')
        expect(opus.contextWindow).toEqual({ input: 9000, output: 4000 })
        expect(modelTier(opus)).toBe(ModelTag.Enterprise)
    })

    it("sets server models and default models if they're not already set", async () => {
        vi.spyOn(userProductSubscriptionModule, 'userProductSubscription', 'get').mockReturnValue(
            Observable.of({ userCanUpgrade: true })
        )
        // expect all defaults to be set
        expect(await firstValueFrom(modelsService.getDefaultChatModel())).toBe(opus.id)
        expect(await firstValueFrom(modelsService.getDefaultEditModel())).toBe(opus.id)
        expect(
            await firstValueFrom(modelsService.getDefaultModel(ModelUsage.Autocomplete))
        ).toStrictEqual(claude)
    })

    it('allows updating the selected model', async () => {
        vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(Observable.of(result))
        await modelsService.setSelectedModel(ModelUsage.Chat, titan)
        expect(storage.data?.[AUTH_STATUS_FIXTURE_AUTHED.endpoint]!.selected.chat).toBe(titan.id)
    })
})

describe('syncModels', () => {
    it(
        'does not shareReplay of result that is invalidated by authStatus change',
        { repeats: 100 },
        async () => {
            vi.useFakeTimers()
            const mockFetchServerSideModels = vi.fn(
                (): Promise<ServerModelConfiguration | undefined> => Promise.resolve(undefined)
            )
            const authStatusSubject = new Subject<AuthStatus>()
            const configOverwritesSubject = new Subject<CodyLLMSiteConfiguration | null>()
            const clientConfigSubject = new Subject<CodyClientConfig>()
            const syncModelsObservable = syncModels({
                resolvedConfig: authStatusSubject.pipe(shareReplay()).map(
                    authStatus =>
                        ({
                            auth: { serverEndpoint: authStatus.endpoint },
                            configuration: {},
                            clientState: { modelPreferences: {} },
                        }) satisfies PartialDeep<ResolvedConfiguration> as ResolvedConfiguration
                ),
                authStatus: authStatusSubject.pipe(shareReplay()),
                configOverwrites: configOverwritesSubject.pipe(shareReplay()),
                clientConfig: clientConfigSubject.pipe(shareReplay()),
                fetchServerSideModels_: mockFetchServerSideModels,
                userProductSubscription: Observable.of({ userCanUpgrade: true }),
            })
            const { values, clearValues, unsubscribe, done } = readValuesFrom(syncModelsObservable)

            // Nothing is emitted because authStatus hasn't emitted yet.
            expect(values).toStrictEqual<typeof values>([])

            function modelFixture(name: string): Model {
                return createModel({
                    id: name,
                    usage: [ModelUsage.Chat, ModelUsage.Edit],
                    contextWindow: { input: 7000, output: 1000 },
                    tags: [ModelTag.Enterprise],
                })
            }
            function serverModelFixture(name: string): ServerModel {
                return {
                    modelRef: `${name}::a::b`,
                    displayName: name,
                    modelName: name,
                    capabilities: ['chat'],
                    contextWindow: {
                        maxInputTokens: 9000,
                        maxOutputTokens: 4000,
                    },
                } satisfies Partial<ServerModel> as ServerModel
            }

            // Emits when authStatus configOverwrites emits.
            authStatusSubject.next(AUTH_STATUS_FIXTURE_AUTHED)
            await vi.advanceTimersByTimeAsync(0)
            clientConfigSubject.next({
                modelsAPIEnabled: false,
            } satisfies Partial<CodyClientConfig> as CodyClientConfig)
            await vi.advanceTimersByTimeAsync(0)
            configOverwritesSubject.next({ chatModel: 'foo' })
            await vi.advanceTimersByTimeAsync(0)
            await vi.runOnlyPendingTimersAsync()
            expect(values).toStrictEqual<typeof values>([
                pendingOperation,
                {
                    localModels: [],
                    primaryModels: [modelFixture('foo')],
                    preferences: {
                        defaults: {},
                        selected: {},
                    },
                },
            ])
            clearValues()

            // Emits immediately when the new data can be computed synchronously.
            clientConfigSubject.next({
                modelsAPIEnabled: false,
            } satisfies Partial<CodyClientConfig> as CodyClientConfig)
            await vi.advanceTimersByTimeAsync(0)
            configOverwritesSubject.next({ chatModel: 'bar' })
            await vi.advanceTimersByTimeAsync(0)
            const result0: ModelsData = {
                localModels: [],
                primaryModels: [modelFixture('bar')],
                preferences: {
                    defaults: {},
                    selected: {},
                },
            }
            expect(values).toStrictEqual<typeof values>([pendingOperation, result0])
            clearValues()
            expect(mockFetchServerSideModels).toHaveBeenCalledTimes(0)
            await expect(
                testing__firstValueFromWithinTime(
                    syncModelsObservable.pipe(skipPendingOperation()),
                    0,
                    vi
                )
            ).resolves.toStrictEqual(result0)
            expect(mockFetchServerSideModels).toHaveBeenCalledTimes(0)

            // Emits when the clientConfig changes.
            const quxModel = serverModelFixture('qux')
            mockFetchServerSideModels.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 10))
                return {
                    models: [quxModel],
                    defaultModels: {
                        chat: 'qux::a::a',
                        fastChat: 'qux::a::a',
                        codeCompletion: 'qux::a::a',
                    },
                    providers: [],
                    revision: '',
                    schemaVersion: '',
                }
            })
            clientConfigSubject.next({
                modelsAPIEnabled: true,
            } satisfies Partial<CodyClientConfig> as CodyClientConfig)
            await vi.advanceTimersByTimeAsync(0)
            expect(mockFetchServerSideModels).toHaveBeenCalledTimes(1)
            mockFetchServerSideModels.mockClear()
            // But new subscribers don't get a value until the clientConfig is fetched.
            await expect(
                testing__firstValueFromWithinTime(
                    syncModelsObservable.pipe(skipPendingOperation()),
                    0,
                    vi
                )
            ).resolves.toBe(undefined)
            expect.soft(mockFetchServerSideModels).toHaveBeenCalledTimes(0)
            mockFetchServerSideModels.mockClear()
            await vi.advanceTimersByTimeAsync(9)
            expect(values).toStrictEqual<typeof values>([pendingOperation])
            clearValues()
            await vi.advanceTimersByTimeAsync(1)
            const result1: ModelsData = {
                localModels: [],
                primaryModels: [createModelFromServerModel(quxModel)],
                preferences: {
                    defaults: {
                        autocomplete: 'qux::a::a',
                        chat: 'qux::a::a',
                        edit: 'qux::a::a',
                    },
                    selected: {},
                },
            }
            expect(mockFetchServerSideModels).toHaveBeenCalledTimes(0)
            expect(values).toStrictEqual<typeof values>([result1])
            clearValues()
            // Now new subscribers do get a value immediately.
            await expect
                .soft(
                    testing__firstValueFromWithinTime(
                        syncModelsObservable.pipe(skipPendingOperation()),
                        0,
                        vi
                    )
                )
                .resolves.toStrictEqual(result1)
            expect(mockFetchServerSideModels).toHaveBeenCalledTimes(0)

            // Does not emit anything when the new data can't be computed synchronously (i.e., it
            // requires a fetch).
            const zzzModel = serverModelFixture('zzz')
            mockFetchServerSideModels.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(() => resolve(undefined), 50))
                return {
                    models: [zzzModel],
                    defaultModels: {
                        chat: 'zzz::a::a',
                        fastChat: 'zzz::a::a',
                        codeCompletion: 'zzz::a::a',
                    },
                    providers: [],
                    revision: '',
                    schemaVersion: '',
                }
            })
            authStatusSubject.next({
                ...AUTH_STATUS_FIXTURE_AUTHED,
                endpoint: 'https://other.example.com',
            })
            await vi.runOnlyPendingTimersAsync()
            clientConfigSubject.next({
                modelsAPIEnabled: true,
            } satisfies Partial<CodyClientConfig> as CodyClientConfig)
            await vi.advanceTimersByTimeAsync(49)
            expect(values).toStrictEqual<typeof values>([pendingOperation])
            clearValues()

            // Before the fetch finishes, the shareReplay should not share anything because the
            // authStatus change invalidated the value.
            expect(await firstValueFrom(syncModelsObservable)).toStrictEqual<(typeof values)[0]>(
                pendingOperation
            )

            // Now the fetch is complete.
            await vi.advanceTimersByTimeAsync(1)
            expect(values).toStrictEqual<typeof values>([
                {
                    localModels: [],
                    primaryModels: [createModelFromServerModel(zzzModel)],
                    preferences: {
                        defaults: {
                            autocomplete: 'zzz::a::a',
                            chat: 'zzz::a::a',
                            edit: 'zzz::a::a',
                        },
                        selected: {},
                    },
                },
            ])
            clearValues()

            unsubscribe()
            await done
        }
    )

    it('not to set Agentic Chat as default chat model when feature flag is enabled', async () => {
        const serverSonnet: ServerModel = {
            modelRef: 'anthropic::unknown::claude-3-5-sonnet',
            displayName: 'Sonnet',
            modelName: 'anthropic.claude-3-5-sonnet',
            capabilities: ['chat'],
            category: 'balanced' as ModelCategory,
            status: 'stable',
            tier: 'enterprise' as ModelTier,
            contextWindow: {
                maxInputTokens: 9000,
                maxOutputTokens: 4000,
            },
        }
        const serverHaiku: ServerModel = {
            modelRef: 'anthropic::unknown::claude-3-5-haiku',
            displayName: 'Haiku',
            modelName: 'anthropic.claude-3-5-haiku',
            capabilities: ['chat'],
            category: 'balanced' as ModelCategory,
            status: 'stable',
            tier: 'enterprise' as ModelTier,
            contextWindow: {
                maxInputTokens: 9000,
                maxOutputTokens: 4000,
            },
        }

        const SERVER_MODELS: ServerModelConfiguration = {
            schemaVersion: '0.0',
            revision: '-',
            providers: [],
            models: [serverSonnet, serverHaiku],
            defaultModels: {
                chat: serverSonnet.modelRef,
                fastChat: serverSonnet.modelRef,
                codeCompletion: serverSonnet.modelRef,
            },
        }

        const mockFetchServerSideModels = vi.fn(() => Promise.resolve(SERVER_MODELS))
        vi.mocked(featureFlagProvider).evaluatedFeatureFlag.mockReturnValue(Observable.of(true))

        const result = await firstValueFrom(
            syncModels({
                resolvedConfig: Observable.of({
                    auth: { serverEndpoint: AUTH_STATUS_FIXTURE_AUTHED.endpoint },
                    configuration: {},
                    clientState: { modelPreferences: {} },
                } satisfies PartialDeep<ResolvedConfiguration> as ResolvedConfiguration),
                authStatus: Observable.of(AUTH_STATUS_FIXTURE_AUTHED),
                configOverwrites: Observable.of(null),
                clientConfig: Observable.of({
                    modelsAPIEnabled: true,
                } satisfies Partial<CodyClientConfig> as CodyClientConfig),
                fetchServerSideModels_: mockFetchServerSideModels,
                userProductSubscription: Observable.of({ userCanUpgrade: true }),
            }).pipe(skipPendingOperation())
        )

        const storage = new TestLocalStorageForModelPreferences()
        modelsService.setStorage(storage)
        mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)
        expect(storage.data?.[AUTH_STATUS_FIXTURE_AUTHED.endpoint]!.selected.chat).toBe(undefined)
        vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(Observable.of(result))

        // Check if Deep Cody model is in the primary models list.
        expect(result.primaryModels.some(model => model.id.includes('deep-cody'))).toBe(true)

        // preference should not be affected and remains unchanged as this is handled in a later step.
        expect(result.preferences.selected.chat).toBe(undefined)
        expect(storage.data?.[AUTH_STATUS_FIXTURE_AUTHED.endpoint]!.selected.chat).toBe(undefined)
    })

    describe('model selection based on user tier and feature flags', () => {
        const serverHaiku: ServerModel = {
            modelRef: 'anthropic::unknown::claude-3-5-haiku',
            displayName: 'Haiku',
            modelName: 'anthropic.claude-3-5-haiku',
            capabilities: ['chat'],
            category: 'balanced' as ModelCategory,
            status: 'stable',
            tier: 'free' as ModelTier,
            contextWindow: {
                maxInputTokens: 7000,
                maxOutputTokens: 4000,
            },
        }
        const serverSonnet: ServerModel = {
            modelRef: 'anthropic::unknown::sonnet',
            displayName: 'Sonnet',
            modelName: 'anthropic.claude-3-5-sonnet',
            capabilities: ['chat'],
            category: 'balanced' as ModelCategory,
            status: 'stable',
            tier: 'enterprise' as ModelTier,
            contextWindow: {
                maxInputTokens: 9000,
                maxOutputTokens: 4000,
            },
        }
        const SERVER_MODELS: ServerModelConfiguration = {
            schemaVersion: '0.0',
            revision: '-',
            providers: [],
            models: [serverHaiku, serverSonnet],
            defaultModels: {
                chat: serverSonnet.modelRef,
                fastChat: serverSonnet.modelRef,
                codeCompletion: serverSonnet.modelRef,
            },
        }
        const mockFetchServerSideModels = vi.fn(() => Promise.resolve(SERVER_MODELS))

        async function getModelResult(featureFlagEnabled: boolean, userCanUpgrade: boolean) {
            // set the feature flag
            if (featureFlagEnabled) {
                vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockImplementation(
                    (flag: FeatureFlag) =>
                        flag === FeatureFlag.CodyChatDefaultToClaude35Haiku
                            ? Observable.of(featureFlagEnabled)
                            : Observable.of(false)
                )
            } else {
                vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockImplementation(
                    (flag: FeatureFlag) =>
                        flag === FeatureFlag.CodyChatDefaultToClaude35Haiku
                            ? Observable.of(featureFlagEnabled)
                            : Observable.of(true)
                )
            }

            return firstValueFrom(
                syncModels({
                    resolvedConfig: Observable.of({
                        auth: { serverEndpoint: DOTCOM_URL.toString() },
                        configuration: {},
                        clientState: { modelPreferences: {} },
                    } satisfies PartialDeep<ResolvedConfiguration> as ResolvedConfiguration),
                    authStatus: Observable.of({
                        ...AUTH_STATUS_FIXTURE_AUTHED,
                        endpoint: DOTCOM_URL.toString(),
                        userCanUpgrade,
                    }),
                    configOverwrites: Observable.of(null),
                    clientConfig: Observable.of({
                        modelsAPIEnabled: true,
                    } satisfies Partial<CodyClientConfig> as CodyClientConfig),
                    fetchServerSideModels_: mockFetchServerSideModels,
                    userProductSubscription: Observable.of({ userCanUpgrade }),
                }).pipe(skipPendingOperation())
            )
        }

        it('sets Haiku as default chat model for free users when feature flag is enabled', async () => {
            const result = await getModelResult(true, true)
            expect(result.preferences.defaults.chat?.includes('claude-3-5-haiku')).toBe(true)
            expect(result.primaryModels.some(model => model.id.includes('claude-3-5-haiku'))).toBe(true)
        })

        it('sets Sonnet as default chat model for free tier users when feature flag is disabled', async () => {
            const result = await getModelResult(false, true)
            expect(result.preferences.defaults.chat?.includes('sonnet')).toBe(true)
            expect(result.primaryModels.some(model => model.id.includes('sonnet'))).toBe(true)
        })

        it('sets Sonnet as default chat model for pro tier users', async () => {
            const result = await getModelResult(true, false)
            expect(result.preferences.defaults.chat?.includes('sonnet')).toBe(true)
            expect(result.primaryModels.some(model => model.id.includes('sonnet'))).toBe(true)
        })
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

        const results = maybeAdjustContextWindows(testServerSideModels, {
            tier: 'enterprise',
            longContextWindowFlagEnabled: false,
        })
        const mistralModelNamePrefixes = ['mistral', 'mixtral']
        for (const model of results) {
            let wantMaxInputTokens = defaultMaxInputTokens
            if (mistralModelNamePrefixes.some(p => model.modelName.startsWith(p))) {
                wantMaxInputTokens = mistralAdjustedMaxInputTokens
            }
            expect(model.contextWindow.maxInputTokens).toBe(wantMaxInputTokens)
        }
    })

    it('preserves the context window for enterprise users with Claude-3-Sonnet (Pro tier) when the feature flag is on', () => {
        const models = [
            {
                modelRef: 'anthropic::latest::claude-3-sonnet' as const,
                modelName: 'claude-3-sonnet',
                displayName: 'Claude 3 Sonnet',
                capabilities: ['chat'],
                category: ModelTag.Power as const,
                status: ModelTag.Experimental as const,
                tier: ModelTag.Pro as const,
                contextWindow: {
                    maxInputTokens: 175000,
                    maxOutputTokens: 4000,
                },
            },
        ] satisfies ServerModel[]

        const result = maybeAdjustContextWindows(models, {
            tier: 'enterprise',
            longContextWindowFlagEnabled: true,
        })
        expect(result[0].contextWindow.maxInputTokens).toBe(175000)
        expect(result[0].contextWindow.maxOutputTokens).toBe(4000)
    })

    it('reduces the output tokens for Pro users with Gemini-1.5-Pro (Pro tier) when the feature flag is on', () => {
        const models = [
            {
                modelRef: 'google::v1::gemini-1.5-pro' as const,
                modelName: 'gemini-1.5-pro',
                displayName: 'Gemini 1.5 Pro',
                capabilities: ['chat'],
                category: ModelTag.Power as const,
                status: ModelTag.Experimental as const,
                tier: ModelTag.Pro as const,
                contextWindow: {
                    maxInputTokens: 175000,
                    maxOutputTokens: 8000,
                },
            },
        ] satisfies ServerModel[]

        const result = maybeAdjustContextWindows(models, {
            tier: 'pro',
            longContextWindowFlagEnabled: true,
        })
        expect(result[0].contextWindow.maxInputTokens).toBe(175000)
        expect(result[0].contextWindow.maxOutputTokens).toBe(6000)
    })

    it('reduces the output tokens for Pro users with GPT-o1 (Pro tier) when the feature flag is on', () => {
        const models = [
            {
                modelRef: 'openai::latest::gpt-o1' as const,
                modelName: 'gpt-o1',
                displayName: 'GPT-o1',
                capabilities: ['chat'],
                category: ModelTag.Balanced as const,
                status: 'stable' as const,
                tier: ModelTag.Pro as const,
                contextWindow: {
                    maxInputTokens: 175000,
                    maxOutputTokens: 32000,
                },
            },
        ] satisfies ServerModel[]

        const result = maybeAdjustContextWindows(models, {
            tier: 'pro',
            longContextWindowFlagEnabled: true,
        })
        expect(result[0].contextWindow.maxInputTokens).toBe(175000)
        expect(result[0].contextWindow.maxOutputTokens).toBe(6000)
    })

    it('preserves the context window for enterprise users with GPT-4o (Pro tier) when the feature flag is on', () => {
        const models = [
            {
                modelRef: 'openai::latest::gpt-4o' as const,
                modelName: 'gpt-4o',
                displayName: 'GPT-4o',
                capabilities: ['chat'],
                category: ModelTag.Balanced as const,
                status: 'stable' as const,
                tier: ModelTag.Pro as const,
                contextWindow: {
                    maxInputTokens: 100000,
                    maxOutputTokens: 8000,
                },
            },
        ] satisfies ServerModel[]

        const result = maybeAdjustContextWindows(models, {
            tier: 'enterprise',
            longContextWindowFlagEnabled: true,
        })
        expect(result[0].contextWindow.maxInputTokens).toBe(100000)
        expect(result[0].contextWindow.maxOutputTokens).toBe(8000)
    })

    it('reduces the context window for Pro users with GPT-o1 (Free tier) when the feature flag is off', () => {
        const models = [
            {
                modelRef: 'openai::latest::gpt-o1' as const,
                modelName: 'gpt-o1',
                displayName: 'GPT-o1',
                capabilities: ['chat'],
                category: ModelTag.Balanced as const,
                status: 'stable' as const,
                tier: ModelTag.Free as const,
                contextWindow: {
                    maxInputTokens: 175000,
                    maxOutputTokens: 32000,
                },
            },
        ] satisfies ServerModel[]

        const result = maybeAdjustContextWindows(models, {
            tier: 'pro',
            longContextWindowFlagEnabled: false,
        })
        expect(result[0].contextWindow.maxInputTokens).toBe(45000)
        expect(result[0].contextWindow.maxOutputTokens).toBe(6000)
    })

    it('preserves the context window if the original values are smaller than the adjusted values for Pro users with Claude 3 Opus (Free tier) when the feature flag is off', () => {
        const models = [
            {
                modelRef: 'anthropic::latest::claude-3-opus' as const,
                modelName: 'claude-3-opus',
                displayName: 'Claude 3 Opus',
                capabilities: ['chat', 'reasoning'],
                category: ModelTag.Power as const,
                status: 'stable' as const,
                tier: ModelTag.Free as const,
                contextWindow: {
                    maxInputTokens: 32000,
                    maxOutputTokens: 4000,
                },
            },
        ] satisfies ServerModel[]

        const result = maybeAdjustContextWindows(models, {
            tier: 'pro',
            longContextWindowFlagEnabled: false,
        })
        expect(result[0].contextWindow.maxInputTokens).toBe(32000)
        expect(result[0].contextWindow.maxOutputTokens).toBe(4000)
    })

    it('reduces the context window for Pro users with Claude 3 Opus (Free tier) when the feature flag is off', () => {
        const models = [
            {
                modelRef: 'anthropic::latest::claude-3-opus' as const,
                modelName: 'claude-3-opus',
                displayName: 'Claude 3 Opus',
                capabilities: ['chat', 'reasoning'],
                category: ModelTag.Power as const,
                status: 'stable' as const,
                tier: ModelTag.Free as const,
                contextWindow: {
                    maxInputTokens: 175000,
                    maxOutputTokens: 32000,
                },
            },
        ] satisfies ServerModel[]

        const result = maybeAdjustContextWindows(models, {
            tier: 'pro',
            longContextWindowFlagEnabled: false,
        })
        expect(result[0].contextWindow.maxInputTokens).toBe(45000)
        expect(result[0].contextWindow.maxOutputTokens).toBe(16000)
    })

    it('reduces the input tokens for enterprise users with Claude 3 Opus (Free tier) when the feature flag is off', () => {
        const models = [
            {
                modelRef: 'anthropic::latest::claude-3-opus' as const,
                modelName: 'claude-3-opus',
                displayName: 'Claude 3 Opus',
                capabilities: ['chat', 'reasoning'],
                category: ModelTag.Power as const,
                status: 'stable' as const,
                tier: ModelTag.Free as const,
                contextWindow: {
                    maxInputTokens: 175000,
                    maxOutputTokens: 32000,
                },
            },
        ] satisfies ServerModel[]

        const result = maybeAdjustContextWindows(models, {
            tier: 'enterprise',
            longContextWindowFlagEnabled: false,
        })
        expect(result[0].contextWindow.maxInputTokens).toBe(45000)
        expect(result[0].contextWindow.maxOutputTokens).toBe(32000)
    })

    it('reduces the input tokens for enterprise users with GPT-4o (Pro tier) when the feature flag is off', () => {
        const models = [
            {
                modelRef: 'openai::latest::gpt-4o' as const,
                modelName: 'gpt-4o',
                displayName: 'GPT-4o',
                capabilities: ['chat'],
                category: ModelTag.Balanced as const,
                status: 'stable' as const,
                tier: ModelTag.Pro as const,
                contextWindow: {
                    maxInputTokens: 100000,
                    maxOutputTokens: 8000,
                },
            },
        ] satisfies ServerModel[]

        const result = maybeAdjustContextWindows(models, {
            tier: 'enterprise',
            longContextWindowFlagEnabled: false,
        })
        expect(result[0].contextWindow.maxInputTokens).toBe(45000)
        expect(result[0].contextWindow.maxOutputTokens).toBe(8000)
    })

    it('reduces the context window for free users with GPT-o1 (Free tier) when the feature flag is on', () => {
        const models = [
            {
                modelRef: 'openai::latest::gpt-o1' as const,
                modelName: 'gpt-o1',
                displayName: 'GPT-o1',
                capabilities: ['chat'],
                category: ModelTag.Balanced as const,
                status: 'stable' as const,
                tier: ModelTag.Free as const,
                contextWindow: {
                    maxInputTokens: 175000,
                    maxOutputTokens: 32000,
                },
            },
        ] satisfies ServerModel[]

        const result = maybeAdjustContextWindows(models, {
            tier: 'free',
            longContextWindowFlagEnabled: true,
        })
        expect(result[0].contextWindow.maxInputTokens).toBe(45000)
        expect(result[0].contextWindow.maxOutputTokens).toBe(4000)
    })

    it('reduces the context window for free users with GPT-o1 (Free tier) when the feature flag is off', () => {
        const models = [
            {
                modelRef: 'openai::latest::gpt-o1' as const,
                modelName: 'gpt-o1',
                displayName: 'GPT-o1',
                capabilities: ['chat'],
                category: ModelTag.Balanced as const,
                status: 'stable' as const,
                tier: ModelTag.Free as const,
                contextWindow: {
                    maxInputTokens: 175000,
                    maxOutputTokens: 32000,
                },
            },
        ] satisfies ServerModel[]

        const result = maybeAdjustContextWindows(models, {
            tier: 'free',
            longContextWindowFlagEnabled: false,
        })
        expect(result[0].contextWindow.maxInputTokens).toBe(45000)
        expect(result[0].contextWindow.maxOutputTokens).toBe(4000)
    })

    it('adjusts the context window for Mistral models by reducing it by 15%', () => {
        const models = [
            {
                modelRef: 'mistral::latest::mistral-large' as const,
                modelName: 'mistral-large',
                displayName: 'Mistral Large',
                capabilities: ['chat'],
                category: ModelTag.Power as const,
                status: 'stable' as const,
                tier: ModelTag.Pro as const,
                contextWindow: {
                    maxInputTokens: 10000,
                    maxOutputTokens: 2000,
                },
            },
        ] satisfies ServerModel[]

        const result = maybeAdjustContextWindows(models, {
            tier: 'enterprise',
            longContextWindowFlagEnabled: false,
        })
        // 10000 * 0.85 = 8500
        expect(result[0].contextWindow.maxInputTokens).toBe(8500)
    })

    it('adjusts the context window for Mixtral models by reducing it by 15%', () => {
        const models = [
            {
                modelRef: 'mistral::latest::mixtral-8x7b' as const,
                modelName: 'mixtral-8x7b',
                displayName: 'Mixtral 8x7B',
                capabilities: ['chat'],
                category: ModelTag.Power as const,
                status: 'stable' as const,
                tier: ModelTag.Pro as const,
                contextWindow: {
                    maxInputTokens: 12000,
                    maxOutputTokens: 2000,
                },
            },
        ] satisfies ServerModel[]

        const result = maybeAdjustContextWindows(models, {
            tier: 'enterprise',
            longContextWindowFlagEnabled: false,
        })
        // 12000 * 0.85 = 10200
        expect(result[0].contextWindow.maxInputTokens).toBe(10200)
    })

    it('correctly processes multiple models in a single call', () => {
        const models = [
            {
                modelRef: 'openai::latest::gpt-4' as const,
                modelName: 'gpt-4',
                displayName: 'GPT-4',
                capabilities: ['chat'],
                category: ModelTag.Balanced as const,
                status: 'stable' as const,
                tier: ModelTag.Pro as const,
                contextWindow: {
                    maxInputTokens: 8000,
                    maxOutputTokens: 2000,
                },
            },
            {
                modelRef: 'mistral::latest::mistral-large' as const,
                modelName: 'mistral-large',
                displayName: 'Mistral Large',
                capabilities: ['chat'],
                category: ModelTag.Power as const,
                status: 'stable' as const,
                tier: ModelTag.Pro as const,
                contextWindow: {
                    maxInputTokens: 10000,
                    maxOutputTokens: 2000,
                },
            },
        ] satisfies ServerModel[]

        const result = maybeAdjustContextWindows(models, {
            tier: 'enterprise',
            longContextWindowFlagEnabled: false,
        })
        expect(result[0].contextWindow.maxInputTokens).toBe(8000) // No change for OpenAI
        expect(result[1].contextWindow.maxInputTokens).toBe(8500) // Adjusted for Mistral (10000 * 0.85)
    })
})
