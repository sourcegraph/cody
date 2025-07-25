import { Observable } from 'observable-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { featureFlagProvider } from '@sourcegraph/cody-shared'

import { mockLocalStorage } from '../../services/LocalStorageProvider'

import {
    type AutocompleteProviderValuesToAssert,
    getAutocompleteProviderFromLocalSettings,
    getAutocompleteProviderFromServerSideModelConfig,
    getAutocompleteProviderFromSiteConfigCodyLLMConfiguration,
    getRequestParamsWithoutMessages,
    testAutocompleteProvider,
} from './shared/helpers'
import { BYOK_MODEL_ID_FOR_LOGS } from './shared/provider'

describe('unstable-openai autocomplete provider', () => {
    beforeEach(async () => {
        mockLocalStorage()
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
    })

    describe('supports unstable-openai ID', () => {
        const unstableOpenaiAssertion = {
            providerId: 'unstable-openai',
            legacyModel: 'gpt-4o',
            requestParams: {
                maxTokensToSample: 256,
                temperature: 0.2,
                timeoutMs: 7000,
                topK: 0,
                topP: 0.5,
            },
        } satisfies AutocompleteProviderValuesToAssert

        testAutocompleteProvider('local-editor-settings', unstableOpenaiAssertion, () =>
            getAutocompleteProviderFromLocalSettings({
                providerId: 'unstable-openai',
                legacyModel: 'gpt-4o',
            })
        )

        testAutocompleteProvider('server-side-model-config', unstableOpenaiAssertion, () =>
            getAutocompleteProviderFromServerSideModelConfig({
                modelRef: 'unstable-openai::2024-02-01::gpt-4o',
                isBYOK: true,
            })
        )

        testAutocompleteProvider('site-config-cody-llm-configuration', unstableOpenaiAssertion, () =>
            getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
                provider: 'sourcegraph',
                completionModel: 'unstable-openai/gpt-4o',
            })
        )

        it('[enterprise] site-config-cody-llm-configuration BYOK', async () => {
            const provider = await getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
                provider: 'openai',
                completionModel: undefined,
            })

            expect(provider.id).toBe(unstableOpenaiAssertion.providerId)
            expect(provider.legacyModel).toBe(BYOK_MODEL_ID_FOR_LOGS)
            expect(getRequestParamsWithoutMessages(provider)).toStrictEqual(
                unstableOpenaiAssertion.requestParams
            )
        })
    })

    describe('supports azure-openai ID', () => {
        const azureOpenaiAssertion = {
            providerId: 'unstable-openai',
            legacyModel: 'gpt-4o-mini-test',
            requestParams: {
                maxTokensToSample: 256,
                temperature: 0.2,
                timeoutMs: 7000,
                topK: 0,
                topP: 0.5,
            },
        } satisfies AutocompleteProviderValuesToAssert

        testAutocompleteProvider('local-editor-settings', azureOpenaiAssertion, () =>
            getAutocompleteProviderFromLocalSettings({
                providerId: 'azure-openai',
                legacyModel: 'gpt-4o-mini-test',
            })
        )

        testAutocompleteProvider('server-side-model-config', azureOpenaiAssertion, () =>
            getAutocompleteProviderFromServerSideModelConfig({
                modelRef: 'azure-openai::v1::gpt-4o-mini-test',
                isBYOK: true,
            })
        )

        testAutocompleteProvider('site-config-cody-llm-configuration', azureOpenaiAssertion, () =>
            getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
                provider: 'sourcegraph',
                completionModel: 'azure-openai/gpt-4o-mini-test',
            })
        )

        it('[enterprise] site-config-cody-llm-configuration BYOK', async () => {
            const provider = await getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
                provider: 'azure-openai',
                completionModel: undefined,
            })

            expect(provider.id).toBe(azureOpenaiAssertion.providerId)
            expect(provider.legacyModel).toBe(BYOK_MODEL_ID_FOR_LOGS)
            expect(getRequestParamsWithoutMessages(provider)).toStrictEqual(
                azureOpenaiAssertion.requestParams
            )
        })
    })
})
