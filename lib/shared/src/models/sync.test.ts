import { Observable, Subject } from 'observable-fns'
import { describe, expect, it, vi } from 'vitest'
import { mockAuthStatus } from '../auth/authStatus'
import { AUTH_STATUS_FIXTURE_AUTHED, type AuthStatus } from '../auth/types'
import { CLIENT_CAPABILITIES_FIXTURE, mockClientCapabilities } from '../configuration/clientCapabilities'
import type { ResolvedConfiguration } from '../configuration/resolver'
import { featureFlagProvider } from '../experimentation/FeatureFlagProvider'
import {
    firstValueFrom,
    readValuesFrom,
    shareReplay,
    testing__firstValueFromWithinTime,
} from '../misc/observable'
import { pendingOperation, skipPendingOperation } from '../misc/observableOperation'
import type { CodyClientConfig } from '../sourcegraph-api/clientConfig'
import type { CodyLLMSiteConfiguration } from '../sourcegraph-api/graphql/client'
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
    const opus = createModelFromServerModel(serverOpus, false)

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
    const claude = createModelFromServerModel(serverClaude, false)

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
    const titan = createModelFromServerModel(serverTitan, false)

    const SERVER_MODELS: ServerModelConfiguration = {
        schemaVersion: '1.0',
        revision: '-',
        providers: [],
        models: [serverOpus, serverClaude, serverTitan],
        defaultModels: {
            chat: serverOpus.modelRef,
            fastChat: serverTitan.modelRef,
            codeCompletion: serverClaude.modelRef,
            unlimitedChat: serverOpus.modelRef,
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
                    isRateLimited: false,
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
                isRateLimited: false,
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
                        unlimitedChat: 'qux::a::a',
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
                isRateLimited: false,
                localModels: [],
                primaryModels: [createModelFromServerModel(quxModel, false)],
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
                        unlimitedChat: 'zzz::a::a',
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
                    isRateLimited: false,
                    localModels: [],
                    primaryModels: [createModelFromServerModel(zzzModel, false)],
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

    it('Agentic Chat does not show up in the model dropdown even if the old feature flag is enabled', async () => {
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
                unlimitedChat: serverSonnet.modelRef,
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
            }).pipe(skipPendingOperation())
        )

        const storage = new TestLocalStorageForModelPreferences()
        modelsService.setStorage(storage)
        mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)
        expect(storage.data?.[AUTH_STATUS_FIXTURE_AUTHED.endpoint]!.selected.chat).toBe(undefined)
        vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(Observable.of(result))

        // Check if Deep Cody model is no longer in the models list.
        expect(result.primaryModels.some(model => model.id.includes('deep-cody'))).toBe(false)

        // preference should not be affected and remains unchanged as this is handled in a later step.
        expect(result.preferences.selected.chat).toBe(undefined)
        expect(storage.data?.[AUTH_STATUS_FIXTURE_AUTHED.endpoint]!.selected.chat).toBe(undefined)
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
            enhancedContextWindowFlagEnabled: false,
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
    it('keeps original context window for old clients', () => {
        // Arrange
        const model: ServerModel = {
            modelRef: 'test::1::model',
            displayName: 'Test Model',
            modelName: 'test-model',
            capabilities: ['chat'],
            category: 'balanced' as ModelCategory,
            status: 'stable',
            tier: ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 10000,
                maxOutputTokens: 4000,
            },
            modelConfigAllTiers: {
                pro: {
                    contextWindow: {
                        maxInputTokens: 12000,
                        maxOutputTokens: 5000,
                        maxUserInputTokens: 8000,
                    },
                },
                free: {
                    contextWindow: {
                        maxInputTokens: 8000,
                        maxOutputTokens: 4000,
                        maxUserInputTokens: 6000,
                    },
                },
                enterprise: {
                    contextWindow: {
                        maxInputTokens: 12000,
                        maxOutputTokens: 5000,
                        maxUserInputTokens: 8000,
                    },
                },
            },
        }
        const config = {
            tier: 'pro' as const,
            enhancedContextWindowFlagEnabled: false,
        }

        // Act
        const result = maybeAdjustContextWindows([model], config)[0]

        // Assert
        expect(result.contextWindow).toEqual({
            maxInputTokens: 10000,
            maxOutputTokens: 4000,
        })
    })

    it('applies enhanced context window limits when flag is enabled', () => {
        // Arrange
        const model: ServerModel = {
            modelRef: 'test::1::model',
            displayName: 'Test Model',
            modelName: 'test-model',
            capabilities: ['chat'],
            category: 'balanced' as ModelCategory,
            status: 'stable',
            tier: ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 10000,
                maxOutputTokens: 4000,
            },
            modelConfigAllTiers: {
                pro: {
                    contextWindow: {
                        maxInputTokens: 12000,
                        maxOutputTokens: 5000,
                        maxUserInputTokens: 8000,
                    },
                },
                free: {
                    contextWindow: {
                        maxInputTokens: 8000,
                        maxOutputTokens: 4000,
                        maxUserInputTokens: 6000,
                    },
                },
                enterprise: {
                    contextWindow: {
                        maxInputTokens: 12000,
                        maxOutputTokens: 5000,
                        maxUserInputTokens: 8000,
                    },
                },
            },
        }
        const config = {
            tier: 'pro' as const,
            enhancedContextWindowFlagEnabled: true,
        }

        // Act
        const result = maybeAdjustContextWindows([model], config)[0]

        // Assert
        expect(result.contextWindow).toEqual({
            maxInputTokens: 12000,
            maxOutputTokens: 5000,
            maxUserInputTokens: 8000,
        })
    })
})
