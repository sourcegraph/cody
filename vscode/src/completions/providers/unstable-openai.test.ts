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

        testAutocompleteProvider('local-editor-settings', unstableOpenaiAssertion, isDotCom =>
            getAutocompleteProviderFromLocalSettings({
                providerId: 'unstable-openai',
                legacyModel: 'gpt-4o',
                isDotCom,
            })
        )

        testAutocompleteProvider('server-side-model-config', unstableOpenaiAssertion, isDotCom =>
            getAutocompleteProviderFromServerSideModelConfig({
                modelRef: 'unstable-openai::2024-02-01::gpt-4o',
                isDotCom,
                isBYOK: !isDotCom,
            })
        )

        testAutocompleteProvider(
            'site-config-cody-llm-configuration',
            unstableOpenaiAssertion,
            isDotCom =>
                getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
                    provider: 'sourcegraph',
                    completionModel: 'unstable-openai/gpt-4o',
                    isDotCom,
                })
        )

        it('[enterprise] site-config-cody-llm-configuration BYOK', async () => {
            const provider = await getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
                provider: 'openai',
                completionModel: undefined,
                isDotCom: false,
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

        testAutocompleteProvider('local-editor-settings', azureOpenaiAssertion, isDotCom =>
            getAutocompleteProviderFromLocalSettings({
                providerId: 'azure-openai',
                legacyModel: 'gpt-4o-mini-test',
                isDotCom,
            })
        )

        testAutocompleteProvider('server-side-model-config', azureOpenaiAssertion, isDotCom =>
            getAutocompleteProviderFromServerSideModelConfig({
                modelRef: 'azure-openai::v1::gpt-4o-mini-test',
                isDotCom,
                isBYOK: !isDotCom,
            })
        )

        testAutocompleteProvider('site-config-cody-llm-configuration', azureOpenaiAssertion, isDotCom =>
            getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
                provider: 'sourcegraph',
                completionModel: 'azure-openai/gpt-4o-mini-test',
                isDotCom,
            })
        )

        it('[enterprise] site-config-cody-llm-configuration BYOK', async () => {
            const provider = await getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
                provider: 'azure-openai',
                completionModel: undefined,
                isDotCom: false,
            })

            expect(provider.id).toBe(azureOpenaiAssertion.providerId)
            expect(provider.legacyModel).toBe(BYOK_MODEL_ID_FOR_LOGS)
            expect(getRequestParamsWithoutMessages(provider)).toStrictEqual(
                azureOpenaiAssertion.requestParams
            )
        })
    })
})
