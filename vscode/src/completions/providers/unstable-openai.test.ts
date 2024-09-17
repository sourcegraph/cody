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

describe('unstable-openai', () => {
    beforeEach(async () => {
        mockLocalStorage()
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
    })

    const valuesToAssert = {
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

    testAutocompleteProvider('local-editor-settings', valuesToAssert, isDotCom =>
        getAutocompleteProviderFromLocalSettings({
            providerId: 'unstable-openai',
            legacyModel: 'gpt-4o',
            isDotCom,
        })
    )

    testAutocompleteProvider('server-side-model-config', valuesToAssert, isDotCom =>
        getAutocompleteProviderFromServerSideModelConfig({
            modelRef: 'unstable-openai::2024-02-01::gpt-4o',
            isDotCom,
        })
    )

    testAutocompleteProvider('site-config-cody-llm-configuration', valuesToAssert, isDotCom =>
        getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            providerId: 'unstable-openai',
            legacyModel: 'gpt-4o',
            isDotCom,
        })
    )
})
