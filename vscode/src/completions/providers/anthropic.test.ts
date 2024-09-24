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

describe('anthropic autocomplete provider', () => {
    beforeEach(async () => {
        mockLocalStorage()
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
    })

    afterEach(() => {
        modelsService.reset()
    })

    const sonnetAssertion = {
        providerId: 'anthropic',
        legacyModel: 'claude-3-sonnet',
        requestParams: {
            maxTokensToSample: 256,
            temperature: 0,
            timeoutMs: 7000,
            topK: 0,
            topP: 0.95,
            model: 'claude-3-sonnet',
        },
    } satisfies AutocompleteProviderValuesToAssert

    const haikuAssertion = {
        providerId: 'anthropic',
        legacyModel: 'claude-3-haiku-20240307',
        requestParams: {
            maxTokensToSample: 256,
            temperature: 0,
            timeoutMs: 7000,
            topK: 0,
            topP: 0.95,
            model: 'claude-3-haiku-20240307',
        },
    } satisfies AutocompleteProviderValuesToAssert

    // testAutocompleteProvider('local-editor-settings', sonnetAssertion, isDotCom =>
    //     getAutocompleteProviderFromLocalSettings({
    //         providerId: 'anthropic',
    //         legacyModel: 'claude-3-sonnet',
    //         isDotCom,
    //     })
    // )

    // testAutocompleteProvider('server-side-model-config', sonnetAssertion, isDotCom =>
    //     getAutocompleteProviderFromServerSideModelConfig({
    //         modelRef: 'anthropic::2023-06-01::claude-3-sonnet',
    //         isDotCom,
    //     })
    // )

    // testAutocompleteProvider('site-config-cody-llm-configuration', sonnetAssertion, isDotCom =>
    //     getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
    //         providerId: 'anthropic',
    //         legacyModel: 'claude-3-sonnet',
    //         isDotCom,
    //     })
    // )

    testAutocompleteProvider('site-config-cody-llm-configuration', haikuAssertion, isDotCom =>
        getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            providerId: 'anthropic',
            legacyModel: 'anthropic/claude-3-haiku-20240307',
            isDotCom,
        })
    )
})
