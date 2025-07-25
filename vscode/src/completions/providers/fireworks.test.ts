import { Observable } from 'observable-fns'
import { beforeEach, describe, it, vi } from 'vitest'

import { featureFlagProvider } from '@sourcegraph/cody-shared'

import { mockLocalStorage } from '../../services/LocalStorageProvider'

import {
    type AutocompleteProviderValuesToAssert,
    assertProviderValues,
    getAutocompleteProviderFromLocalSettings,
    getAutocompleteProviderFromServerSideModelConfig,
    getAutocompleteProviderFromSiteConfigCodyLLMConfiguration,
    testAutocompleteProvider,
} from './shared/helpers'

describe('fireworks autocomplete provider', () => {
    beforeEach(async () => {
        mockLocalStorage()
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
    })

    const deepseekAssertion = {
        providerId: 'fireworks',
        legacyModel: 'deepseek-coder-v2-lite-base',
        requestParams: {
            maxTokensToSample: 256,
            temperature: 0.2,
            timeoutMs: 7000,
            topK: 0,
            model: 'fireworks/deepseek-coder-v2-lite-base',
        },
    } satisfies AutocompleteProviderValuesToAssert

    const starcoderAssertion = {
        providerId: 'fireworks',
        legacyModel: 'starcoder-hybrid',
        requestParams: {
            maxTokensToSample: 256,
            temperature: 0.2,
            timeoutMs: 7000,
            topK: 0,
            model: 'fireworks/starcoder-7b',
        },
    } satisfies AutocompleteProviderValuesToAssert

    it('[enterprise] local-editor-settings without model', async () => {
        const provider = await getAutocompleteProviderFromLocalSettings({
            providerId: 'fireworks',
            legacyModel: null,
        })

        assertProviderValues(provider, starcoderAssertion)
    })

    testAutocompleteProvider('server-side-model-config', deepseekAssertion, () =>
        getAutocompleteProviderFromServerSideModelConfig({
            modelRef: 'fireworks::v1::deepseek-coder-v2-lite-base',
            isBYOK: true,
        })
    )

    testAutocompleteProvider('site-config-cody-llm-configuration', deepseekAssertion, () =>
        getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'fireworks/deepseek-coder-v2-lite-base',
            provider: 'sourcegraph',
        })
    )

    testAutocompleteProvider('site-config-cody-llm-configuration', starcoderAssertion, () =>
        getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'fireworks/starcoder-hybrid',
            provider: 'sourcegraph',
        })
    )
})
