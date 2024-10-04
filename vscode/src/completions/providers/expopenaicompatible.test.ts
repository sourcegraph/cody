import { Observable } from 'observable-fns'
import { beforeEach, describe, vi } from 'vitest'

import { featureFlagProvider } from '@sourcegraph/cody-shared'

import { mockLocalStorage } from '../../services/LocalStorageProvider'

import {
    type AutocompleteProviderValuesToAssert,
    getAutocompleteProviderFromLocalSettings,
    getAutocompleteProviderFromServerSideModelConfig,
    getAutocompleteProviderFromSiteConfigCodyLLMConfiguration,
    testAutocompleteProvider,
} from './shared/helpers'

describe('experimental-openaicompatible autocomplete provider', () => {
    beforeEach(async () => {
        mockLocalStorage()
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
    })

    const starChatAssertion = {
        providerId: 'experimental-openaicompatible',
        legacyModel: 'starchat-16b-beta',
        requestParams: {
            maxTokensToSample: 256,
            temperature: 0.2,
            timeoutMs: 7000,
            topK: 0,
            model: undefined,
        },
    } satisfies AutocompleteProviderValuesToAssert

    const starCoderHybridAssertion = {
        providerId: 'experimental-openaicompatible',
        legacyModel: 'starcoder-hybrid',
        requestParams: {
            maxTokensToSample: 256,
            temperature: 0.2,
            timeoutMs: 7000,
            topK: 0,
            model: 'openaicompatible/starcoder-7b',
        },
    } satisfies AutocompleteProviderValuesToAssert

    testAutocompleteProvider('local-editor-settings without model', starCoderHybridAssertion, isDotCom =>
        getAutocompleteProviderFromLocalSettings({
            providerId: 'experimental-openaicompatible',
            legacyModel: null,
            isDotCom,
        })
    )

    testAutocompleteProvider('local-editor-settings with model', starChatAssertion, isDotCom =>
        getAutocompleteProviderFromLocalSettings({
            providerId: 'experimental-openaicompatible',
            legacyModel: 'starchat-16b-beta',
            isDotCom,
        })
    )

    testAutocompleteProvider('server-side-model-config', starChatAssertion, isDotCom =>
        getAutocompleteProviderFromServerSideModelConfig({
            modelRef: 'experimental-openaicompatible::2024-02-01::starchat-16b-beta',
            isDotCom,
            isBYOK: !isDotCom,
        })
    )

    testAutocompleteProvider('site-config-cody-llm-configuration', starChatAssertion, isDotCom =>
        getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            provider: 'sourcegraph',
            completionModel: 'experimental-openaicompatible/starchat-16b-beta',
            isDotCom,
        })
    )

    testAutocompleteProvider('site-config-cody-llm-configuration', starCoderHybridAssertion, isDotCom =>
        getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            provider: 'sourcegraph',
            completionModel: 'experimental-openaicompatible/starcoder-hybrid',
            isDotCom,
        })
    )
})
