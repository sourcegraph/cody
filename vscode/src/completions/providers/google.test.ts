import { Observable } from 'observable-fns'
import { afterEach, beforeEach, describe, vi } from 'vitest'

import { featureFlagProvider, modelsService } from '@sourcegraph/cody-shared'

import { mockLocalStorage } from '../../services/LocalStorageProvider'

import {
    type AutocompleteProviderValuesToAssert,
    getAutocompleteProviderFromLocalSettings,
    getAutocompleteProviderFromServerSideModelConfig,
    getAutocompleteProviderFromSiteConfigCodyLLMConfiguration,
    testAutocompleteProvider,
} from './shared/helpers'

describe('google autocomplete provider', () => {
    beforeEach(async () => {
        mockLocalStorage()
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
    })

    afterEach(() => {
        modelsService.reset()
    })

    const starChatAssertion = {
        providerId: 'google',
        legacyModel: 'gemini-1.5-flash-latest',
        requestParams: {
            maxTokensToSample: 256,
            temperature: 0,
            timeoutMs: 7000,
            topK: 0,
            topP: 0.95,
            model: 'gemini-1.5-flash-latest',
        },
    } satisfies AutocompleteProviderValuesToAssert

    testAutocompleteProvider('local-editor-settings', starChatAssertion, isDotCom =>
        getAutocompleteProviderFromLocalSettings({
            providerId: 'google',
            legacyModel: 'gemini-1.5-flash-latest',
            isDotCom,
        })
    )

    testAutocompleteProvider('server-side-model-config', starChatAssertion, isDotCom =>
        getAutocompleteProviderFromServerSideModelConfig({
            modelRef: 'google::v1::gemini-1.5-flash-latest',
            isDotCom,
        })
    )

    testAutocompleteProvider('site-config-cody-llm-configuration', starChatAssertion, isDotCom =>
        getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            providerId: 'google',
            legacyModel: 'gemini-1.5-flash-latest',
            isDotCom,
        })
    )
})
