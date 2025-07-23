import { Observable } from 'observable-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
    AUTH_STATUS_FIXTURE_AUTHED,
    AUTH_STATUS_FIXTURE_AUTHED_DOTCOM,
    type CodyLLMSiteConfiguration,
    type ModelsData,
    featureFlagProvider,
    firstValueFrom,
    mockAuthStatus,
    modelsService,
    skipPendingOperation,
} from '@sourcegraph/cody-shared'

import { mockLocalStorage } from '../../../services/LocalStorageProvider'

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
                configOverwrites: Observable.of<CodyLLMSiteConfiguration | null>(null),
            })

            await expect(createCall).rejects.toThrowErrorMatchingInlineSnapshot(
                `[Error: Failed to create "nasa-ai" autocomplete provider derived from "local-editor-settings". Please check your local "cody.autocomplete.advanced.provider" setting.]`
            )
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
                configOverwrites: Observable.of<CodyLLMSiteConfiguration | null>(null),
            })
            expect(provider.id).toBe('unstable-openai')
            expect(provider.legacyModel).toBe(
                'model-will-be-picked-by-sourcegraph-backend-based-on-site-config'
            )
        })
    })

    describe('legacy site-config Cody LLM configuration', () => {
        const testCases: CodyLLMSiteConfiguration[] = [
            // sourcegraph
            {
                provider: 'sourcegraph',
                completionModel: 'hello-world',
            },
            // unknown-provider
            {
                provider: 'unknown-provider',
                completionModel: 'superdupercoder-7b',
            },
            // provider not defined (backward compat)
            {
                provider: undefined,
                completionModel: 'superdupercoder-7b',
            },
        ]

        for (const configOverwrites of testCases) {
            it(`throws when cody LLM config is ${JSON.stringify(configOverwrites)}`, async () => {
                const createCall = createProviderForTest({
                    config: {
                        configuration: {
                            autocompleteAdvancedProvider: 'default',
                            autocompleteAdvancedModel: null,
                        },
                    },
                    authStatus: AUTH_STATUS_FIXTURE_AUTHED_DOTCOM,
                    configOverwrites: Observable.of<CodyLLMSiteConfiguration | null>(configOverwrites),
                })

                await expect(createCall).rejects.toThrow()
            })
        }
    })
})
