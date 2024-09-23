import { Observable } from 'observable-fns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { featureFlagProvider, modelsService } from '@sourcegraph/cody-shared'

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

    afterEach(() => {
        modelsService.reset()
    })

    const valuesToAssert = {
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
            isDotCom: true,
        })

        await expect(createCall).rejects.toThrowErrorMatchingInlineSnapshot(
            // biome-ignore lint/style/noUnusedTemplateLiteral: snapshot value
            `[Error: Model definition is missing for \`openaicompatible\` provider.]`
        )
    })

    it('[dotcom] server-side-model-config', async () => {
        const provider = await getAutocompleteProviderFromServerSideModelConfig({
            modelRef: 'groq::v1::llama-3.1-70b-versatile',
            isDotCom: true,
        })

        // Switches to the first available model, because `llama-3.1-70b-versatile` is
        // the enterprise tier model and cannot be used on DotCom.
        expect(provider.id).toBe('anthropic')
        expect(provider.legacyModel).toBe('anthropic/claude-instant-1.2')
    })

    it('[enterprise] server-side-model-config', async () => {
        const provider = await getAutocompleteProviderFromServerSideModelConfig({
            modelRef: 'groq::v1::llama-3.1-70b-versatile',
            isDotCom: false,
        })
        const { providerId, legacyModel, requestParams } = valuesToAssert

        expect(provider.id).toBe(providerId)
        expect(provider.legacyModel).toBe(legacyModel)
        expect(getRequestParamsWithoutMessages(provider)).toMatchObject(requestParams)
    })

    it('throws if used with site-config-cody-llm-configuration', async () => {
        const createCall = getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            providerId: 'openaicompatible',
            legacyModel: 'gpt-4o',
            isDotCom: true,
        })

        await expect(createCall).rejects.toThrowErrorMatchingInlineSnapshot(
            // biome-ignore lint/style/noUnusedTemplateLiteral: snapshot value
            `[Error: Model definition is missing for \`openaicompatible\` provider.]`
        )
    })
})
