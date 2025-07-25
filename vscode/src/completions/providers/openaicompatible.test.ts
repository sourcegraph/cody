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
} from './shared/helpers'

describe('openaicompatible autocomplete provider', () => {
    beforeEach(async () => {
        mockLocalStorage()
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
    })
    const openaicompatibleParams = {
        providerId: 'openaicompatible',
        legacyModel: 'llama-3.1-70b-versatile',
        requestParams: {
            maxTokensToSample: 256,
            temperature: 0.2,
            timeoutMs: 7000,
            topK: 0,
        },
    } satisfies AutocompleteProviderValuesToAssert

    it('throws if used with local-editor-settings', async () => {
        const createCall = getAutocompleteProviderFromLocalSettings({
            providerId: 'openaicompatible',
            legacyModel: 'gpt-4o',
        })

        await expect(createCall).rejects.toThrowErrorMatchingInlineSnapshot(
            // biome-ignore lint/style/noUnusedTemplateLiteral: snapshot value
            `[Error: Model definition is missing for \`openaicompatible\` provider.]`
        )
    })

    it('[enterprise] server-side-model-config', async () => {
        const provider = await getAutocompleteProviderFromServerSideModelConfig({
            modelRef: 'groq::v1::llama-3.1-70b-versatile',
            isBYOK: true,
        })
        const { providerId, legacyModel, requestParams } = openaicompatibleParams

        expect(provider.id).toBe(providerId)
        expect(provider.legacyModel).toBe(legacyModel)
        expect(getRequestParamsWithoutMessages(provider)).toMatchObject(requestParams)
    })

    it('throws if used with site-config-cody-llm-configuration', async () => {
        const createCall = getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            provider: 'sourcegraph',
            completionModel: 'openaicompatible/gpt-4o',
        })

        await expect(createCall).rejects.toThrowErrorMatchingInlineSnapshot(
            // biome-ignore lint/style/noUnusedTemplateLiteral: snapshot value
            `[Error: Model definition is missing for \`openaicompatible\` provider.]`
        )
    })
})
