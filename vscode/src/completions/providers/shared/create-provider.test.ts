import { Observable } from 'observable-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
    AUTH_STATUS_FIXTURE_AUTHED,
    AUTH_STATUS_FIXTURE_AUTHED_DOTCOM,
    type CodyLLMSiteConfiguration,
    ModelUsage,
    type ModelsData,
    ModelsService,
    createModelFromServerModel,
    featureFlagProvider,
    firstResultFromOperation,
    firstValueFrom,
    mockAuthStatus,
    modelsService,
    skipPendingOperation,
} from '@sourcegraph/cody-shared'

import { mockLocalStorage } from '../../../services/LocalStorageProvider'

import { getServerSentModelsMock } from './__mocks__/create-provider-mocks'
import { createProvider } from './create-provider'
import type { Provider } from './provider'

async function createProviderForTest(...args: Parameters<typeof createProvider>): Promise<Provider> {
    const providerOrError = await firstValueFrom(createProvider(...args).pipe(skipPendingOperation()))

    if (providerOrError instanceof Error) {
        throw providerOrError
    }

    return providerOrError
}

const EMPTY_MODELS_DATA: ModelsData = {
    localModels: [],
    preferences: { defaults: {}, selected: {} },
    primaryModels: [],
}

describe('createProvider', () => {
    beforeEach(async () => {
        mockLocalStorage()
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
    })

    describe('local settings', () => {
        beforeEach(() => {
            mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED_DOTCOM)
            vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
                Observable.of(EMPTY_MODELS_DATA)
            )
        })
        it('throws an error message if the configuration completions provider is not supported', async () => {
            const createCall = createProviderForTest({
                config: {
                    configuration: {
                        autocompleteAdvancedProvider: 'nasa-ai',
                        autocompleteAdvancedModel: null,
                    },
                },
                authStatus: AUTH_STATUS_FIXTURE_AUTHED,
            })

            await expect(createCall).rejects.toThrowErrorMatchingInlineSnapshot(
                `[Error: Failed to create "nasa-ai" autocomplete provider derived from "local-editor-settings". Please check your local "cody.autocomplete.advanced.provider" setting.]`
            )
        })

        it('uses configOverwrites if completions provider is not configured', async () => {
            const provider = await createProviderForTest({
                config: {
                    configuration: {
                        autocompleteAdvancedProvider: 'default',
                        autocompleteAdvancedModel: null,
                    },
                },
                authStatus: AUTH_STATUS_FIXTURE_AUTHED_DOTCOM,
            })
            expect(provider.id).toBe('fireworks')
            expect(provider.legacyModel).toBe('starcoder-hybrid')
        })

        it('returns "fireworks" provider config and corresponding model if specified', async () => {
            const provider = await createProviderForTest({
                config: {
                    configuration: {
                        autocompleteAdvancedProvider: 'fireworks',
                        autocompleteAdvancedModel: 'starcoder-7b',
                    },
                },
                authStatus: AUTH_STATUS_FIXTURE_AUTHED,
            })
            expect(provider.id).toBe('fireworks')
            expect(provider.legacyModel).toBe('starcoder-7b')
        })

        it('returns "fireworks" provider config if specified in settings and default model', async () => {
            const provider = await createProviderForTest({
                config: {
                    configuration: {
                        autocompleteAdvancedProvider: 'fireworks',
                        autocompleteAdvancedModel: null,
                    },
                },
                authStatus: AUTH_STATUS_FIXTURE_AUTHED_DOTCOM,
            })
            expect(provider.id).toBe('fireworks')
            expect(provider.legacyModel).toBe('deepseek-coder-v2-lite-base')
        })

        it('provider specified in VSCode settings takes precedence over the one defined in the site config', async () => {
            const provider = await createProviderForTest({
                config: {
                    configuration: {
                        autocompleteAdvancedProvider: 'unstable-openai',
                        autocompleteAdvancedModel: null,
                    },
                },
                authStatus: AUTH_STATUS_FIXTURE_AUTHED,
            })
            expect(provider.id).toBe('unstable-openai')
            expect(provider.legacyModel).toBe(
                'model-will-be-picked-by-sourcegraph-backend-based-on-site-config'
            )
        })
    })

    describe('legacy site-config Cody LLM configuration', () => {
        const testCases: {
            configOverwrites: CodyLLMSiteConfiguration
            expected: { provider: string; legacyModel?: string } | null
        }[] = [
            // sourcegraph
            {
                configOverwrites: { provider: 'sourcegraph', completionModel: 'hello-world' },
                expected: null,
            },
            {
                configOverwrites: {
                    provider: 'sourcegraph',
                    completionModel: 'fireworks/starcoder',
                },
                expected: { provider: 'fireworks', legacyModel: 'starcoder' },
            },

            // open-ai
            {
                configOverwrites: { provider: 'openai', completionModel: 'gpt-35-turbo-test' },
                expected: { provider: 'unstable-openai', legacyModel: 'gpt-35-turbo-test' },
            },
            {
                configOverwrites: { provider: 'openai' },
                expected: {
                    provider: 'unstable-openai',
                    legacyModel: 'model-will-be-picked-by-sourcegraph-backend-based-on-site-config',
                },
            },

            // azure-openai
            {
                configOverwrites: { provider: 'azure-openai', completionModel: 'gpt-35-turbo-test' },
                expected: { provider: 'unstable-openai', legacyModel: 'gpt-35-turbo-test' },
            },
            {
                configOverwrites: { provider: 'azure-openai' },
                expected: {
                    provider: 'unstable-openai',
                    legacyModel: 'model-will-be-picked-by-sourcegraph-backend-based-on-site-config',
                },
            },

            // fireworks
            {
                configOverwrites: { provider: 'fireworks', completionModel: 'starcoder-7b' },
                expected: { provider: 'fireworks', legacyModel: 'starcoder-7b' },
            },
            {
                configOverwrites: { provider: 'fireworks' },
                expected: { provider: 'fireworks', legacyModel: 'deepseek-coder-v2-lite-base' },
            },

            // unknown-provider
            {
                configOverwrites: {
                    provider: 'unknown-provider',
                    completionModel: 'superdupercoder-7b',
                },
                expected: null,
            },

            // provider not defined (backward compat)
            {
                configOverwrites: { provider: undefined, completionModel: 'superdupercoder-7b' },
                expected: null,
            },
        ]

        for (const { configOverwrites, expected } of testCases) {
            it(`returns ${JSON.stringify(expected)} when cody LLM config is ${JSON.stringify(
                configOverwrites
            )}`, async () => {
                const createCall = createProviderForTest({
                    config: {
                        configuration: {
                            autocompleteAdvancedProvider: 'default',
                            autocompleteAdvancedModel: null,
                        },
                    },
                    authStatus: {
                        ...AUTH_STATUS_FIXTURE_AUTHED_DOTCOM,
                        configOverwrites,
                    },
                })
                if (expected === null) {
                    await expect(createCall).rejects.toThrow()
                } else {
                    const provider = await createCall
                    expect(provider.id).toBe(expected.provider)
                    expect(provider.legacyModel).toBe(expected.legacyModel)
                }
            })
        }
    })

    describe('server-side model configuration', () => {
        it('uses all available autocomplete models', async () => {
            const mockedConfig = getServerSentModelsMock()
            const autocompleteModelsInServerConfig = mockedConfig.models.filter(model =>
                model.capabilities.includes('autocomplete')
            )
            const modelsService = new ModelsService(
                Observable.of({
                    localModels: [],
                    preferences: { defaults: {}, selected: {} },
                    primaryModels: autocompleteModelsInServerConfig.map(createModelFromServerModel),
                })
            )
            mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)

            const autocompleteModels = await firstResultFromOperation(
                modelsService.getModels(ModelUsage.Autocomplete)
            )
            expect(autocompleteModels.length).toBe(autocompleteModelsInServerConfig.length)
        })

        it('uses the `fireworks` model from the config', async () => {
            const fireworksModel = getServerSentModelsMock().models.find(
                model => model.modelRef === 'fireworks::v1::deepseek-coder-v2-lite-base'
            )
            expect(fireworksModel).toBeDefined()
            vi.spyOn(modelsService, 'getDefaultModel').mockReturnValue(
                Observable.of(createModelFromServerModel(fireworksModel!))
            )

            const provider = await createProviderForTest({
                config: {
                    configuration: {
                        autocompleteAdvancedProvider: 'default',
                        autocompleteAdvancedModel: null,
                    },
                },
                authStatus: AUTH_STATUS_FIXTURE_AUTHED,
            })
            const currentModel = await firstResultFromOperation(
                modelsService.getDefaultModel(ModelUsage.Autocomplete)
            )

            expect(currentModel?.provider).toBe('fireworks')
            expect(currentModel?.modelRef?.modelId).toBe('deepseek-coder-v2-lite-base')

            expect(provider.id).toBe(currentModel?.provider)
            expect(provider.legacyModel).toBe(currentModel?.modelRef?.modelId)
        })

        it('uses the `anthropic` model from the config', async () => {
            // Change the default autocomplete model to anthropic
            const anthropicModel = getServerSentModelsMock().models.find(
                model => model.modelRef === 'anthropic::2023-06-01::claude-3-sonnet'
            )
            expect(anthropicModel).toBeDefined()
            vi.spyOn(modelsService, 'getDefaultModel').mockReturnValue(
                Observable.of(createModelFromServerModel(anthropicModel!))
            )

            const provider = await createProviderForTest({
                config: {
                    configuration: {
                        autocompleteAdvancedProvider: 'default',
                        autocompleteAdvancedModel: null,
                    },
                },
                authStatus: AUTH_STATUS_FIXTURE_AUTHED,
            })

            expect(provider.id).toBe('anthropic')
            // TODO(valery): use a readable identifier for BYOK providers to communicate that the model ID from the server is used.
        })
    })
})
