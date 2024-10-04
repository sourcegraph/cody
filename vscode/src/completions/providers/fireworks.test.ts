import { Observable } from 'observable-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

    it('[dotcom] local-editor-settings without model', async () => {
        const provider = await getAutocompleteProviderFromLocalSettings({
            providerId: 'fireworks',
            legacyModel: null,
            isDotCom: true,
        })

        assertProviderValues(provider, deepseekAssertion)
    })

    it('[enterprise] local-editor-settings without model', async () => {
        const provider = await getAutocompleteProviderFromLocalSettings({
            providerId: 'fireworks',
            legacyModel: null,
            isDotCom: false,
        })

        assertProviderValues(provider, starcoderAssertion)
    })

    it('[dotcom] local-editor-settings with a model', async () => {
        const provider = await getAutocompleteProviderFromLocalSettings({
            providerId: 'fireworks',
            legacyModel: 'starcoder-hybrid',
            isDotCom: true,
        })

        assertProviderValues(provider, starcoderAssertion)
    })

    it('[dotcom] local-editor-settings with unknown model', async () => {
        const createCall = getAutocompleteProviderFromLocalSettings({
            providerId: 'fireworks',
            legacyModel: 'unknown-model',
            isDotCom: true,
        })

        await expect(createCall).rejects.toThrowErrorMatchingInlineSnapshot(
            `[Error: Unknown model: 'unknown-model']`
        )
    })

    testAutocompleteProvider('server-side-model-config', deepseekAssertion, isDotCom =>
        getAutocompleteProviderFromServerSideModelConfig({
            modelRef: 'fireworks::v1::deepseek-coder-v2-lite-base',
            isDotCom,
            isBYOK: !isDotCom,
        })
    )

    testAutocompleteProvider('site-config-cody-llm-configuration', deepseekAssertion, isDotCom =>
        getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'fireworks/deepseek-coder-v2-lite-base',
            provider: 'sourcegraph',
            isDotCom,
        })
    )

    testAutocompleteProvider('site-config-cody-llm-configuration', starcoderAssertion, isDotCom =>
        getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'fireworks/starcoder-hybrid',
            provider: 'sourcegraph',
            isDotCom,
        })
    )
})
