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
    getRequestParamsWithoutMessages,
} from './shared/helpers'

describe('anthropic autocomplete provider', () => {
    beforeEach(async () => {
        mockLocalStorage()
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
    })

    const claudeInstantAssertion = {
        providerId: 'anthropic',
        legacyModel: 'claude-instant-1.2',
        requestParams: {
            maxTokensToSample: 256,
            temperature: 0.5,
            timeoutMs: 7000,
            topK: 0,
            model: 'anthropic/claude-instant-1.2',
        },
    } satisfies AutocompleteProviderValuesToAssert

    const haikuAssertion = {
        providerId: 'anthropic',
        legacyModel: 'claude-3-haiku-20240307',
        requestParams: {
            maxTokensToSample: 256,
            temperature: 0.5,
            timeoutMs: 7000,
            topK: 0,
            model: 'anthropic/claude-3-haiku-20240307',
        },
    } satisfies AutocompleteProviderValuesToAssert

    it('[dotcom] local-editor-settings without model', async () => {
        const provider = await getAutocompleteProviderFromLocalSettings({
            providerId: 'anthropic',
            legacyModel: null,
            isDotCom: true,
        })

        expect(provider.id).toBe('anthropic')
        expect(provider.legacyModel).toBe('claude-instant-1.2')
        expect(getRequestParamsWithoutMessages(provider)).toStrictEqual(
            claudeInstantAssertion.requestParams
        )
    })

    it('[dotcom] local-editor-settings with model', async () => {
        const provider = await getAutocompleteProviderFromLocalSettings({
            providerId: 'anthropic',
            legacyModel: 'claude-3-haiku-20240307',
            isDotCom: true,
        })

        expect(provider.id).toBe('anthropic')
        // The local editor settings model is ignored for now by the Anthropic provider.
        expect(provider.legacyModel).toBe('claude-instant-1.2')
        expect(getRequestParamsWithoutMessages(provider)).toStrictEqual(
            claudeInstantAssertion.requestParams
        )
    })

    it('[dotcom] server-side-model-config', async () => {
        const provider = await getAutocompleteProviderFromServerSideModelConfig({
            modelRef: 'anthropic::2023-06-01::claude-3-haiku-20240307',
            isDotCom: true,
            isBYOK: false,
        })

        // Still uses claude instant on dotcom.
        const { providerId, legacyModel, requestParams } = claudeInstantAssertion

        expect(provider.id).toBe(providerId)
        expect(provider.legacyModel).toBe(legacyModel)
        expect(getRequestParamsWithoutMessages(provider)).toStrictEqual(requestParams)
    })

    it('[enterprise] CLOUD server-side-model-config', async () => {
        const provider = await getAutocompleteProviderFromServerSideModelConfig({
            modelRef: 'anthropic::2023-06-01::claude-3-haiku-20240307',
            isDotCom: false,
            isBYOK: false,
        })

        const { providerId, legacyModel, requestParams } = haikuAssertion

        expect(provider.id).toBe(providerId)
        expect(provider.legacyModel).toBe(legacyModel)
        expect(getRequestParamsWithoutMessages(provider)).toStrictEqual(requestParams)
    })

    it('[enterprise] BYOK server-side-model-config', async () => {
        const provider = await getAutocompleteProviderFromServerSideModelConfig({
            modelRef: 'anthropic::2023-06-01::claude-3-haiku-20240307',
            isDotCom: false,
            isBYOK: true,
        })

        const { providerId, legacyModel, requestParams } = haikuAssertion

        expect(provider.id).toBe(providerId)
        expect(provider.legacyModel).toBe(legacyModel)
        expect(getRequestParamsWithoutMessages(provider)).toStrictEqual({
            ...requestParams,
            // The model ID is ignored by BYOK clients
            model: undefined,
        })
    })

    it('[dotcom] site-config-cody-llm-configuration', async () => {
        const provider = await getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'anthropic/claude-instant-1.2',
            provider: 'sourcegraph',
            isDotCom: true,
        })

        assertProviderValues(provider, claudeInstantAssertion)
    })

    it('[enterprise] site-config-cody-llm-configuration', async instanceType => {
        const provider = await getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'anthropic/claude-instant-1.2',
            provider: 'sourcegraph',
            isDotCom: false,
        })

        const { providerId, legacyModel, requestParams } = claudeInstantAssertion

        expect(provider.id).toBe(providerId)
        expect(provider.legacyModel).toBe(legacyModel)
        expect(getRequestParamsWithoutMessages(provider)).toStrictEqual(requestParams)
    })

    it('[dotcom] site-config-cody-llm-configuration special case for google hosted models', async () => {
        const provider = await getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'google/claude-instant-1.2',
            provider: 'sourcegraph',
            isDotCom: true,
        })

        assertProviderValues(provider, claudeInstantAssertion)
    })

    it('[enterprise] site-config-cody-llm-configuration special case for google hosted models', async instanceType => {
        const provider = await getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'google/claude-instant-1.2',
            provider: 'sourcegraph',
            isDotCom: false,
        })

        const { providerId, legacyModel, requestParams } = claudeInstantAssertion

        expect(provider.id).toBe(providerId)
        expect(provider.legacyModel).toBe(legacyModel)
        expect(getRequestParamsWithoutMessages(provider)).toStrictEqual(requestParams)
    })

    it('throws if the wrong "completionModel" separator is used', async () => {
        const createCall = getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'anthropic.claude-instant-1.2',
            provider: 'sourcegraph',
            isDotCom: false,
        })

        await expect(createCall).rejects.toThrowErrorMatchingInlineSnapshot(
            `[Error: Failed to parse the model name 'anthropic.claude-instant-1.2' for 'sourcegraph' completions provider.]`
        )
    })

    it('throws if completionModel does not have a model name', async () => {
        const createCall = getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'anthropic/',
            provider: 'sourcegraph',
            isDotCom: false,
        })

        await expect(createCall).rejects.toThrowErrorMatchingInlineSnapshot(
            `[Error: Failed to parse the model name 'anthropic/' for 'sourcegraph' completions provider.]`
        )
    })

    it('throws if completionModel does not have a provider ID', async () => {
        const createCall = getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: '/claude-instant-1.2',
            provider: 'sourcegraph',
            isDotCom: false,
        })

        await expect(createCall).rejects.toThrowErrorMatchingInlineSnapshot(
            `[Error: Failed to parse the model name '/claude-instant-1.2' for 'sourcegraph' completions provider.]`
        )
    })
})

describe('anthropic/aws-bedrock autocomplete provider', () => {
    beforeEach(async () => {
        mockLocalStorage()
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
    })

    const claudeInstantAssertion = {
        providerId: 'anthropic',
        legacyModel: 'claude-instant-1.2',
        requestParams: {
            maxTokensToSample: 256,
            temperature: 0.5,
            timeoutMs: 7000,
            topK: 0,
            model: 'anthropic/claude-instant-1.2',
        },
    } satisfies AutocompleteProviderValuesToAssert

    it('[dotcom] local-editor-settings without model', async () => {
        const provider = await getAutocompleteProviderFromLocalSettings({
            providerId: 'aws-bedrock',
            legacyModel: null,
            isDotCom: true,
        })

        expect(provider.id).toBe('anthropic')
        expect(provider.legacyModel).toBe('claude-instant-1.2')
        expect(getRequestParamsWithoutMessages(provider)).toStrictEqual(
            claudeInstantAssertion.requestParams
        )
    })

    it('[dotcom] site-config-cody-llm-configuration', async () => {
        const provider = await getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'anthropic.claude-instant-1.2',
            provider: 'aws-bedrock',
            isDotCom: true,
        })

        assertProviderValues(provider, {
            ...claudeInstantAssertion,
            requestParams: {
                ...claudeInstantAssertion.requestParams,
                // The model ID is ignored by BYOK clients
                model: undefined,
            },
        })
    })

    it('[enterprise] site-config-cody-llm-configuration', async () => {
        const provider = await getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'anthropic.claude-instant-1.2',
            provider: 'aws-bedrock',
            isDotCom: false,
        })

        const { providerId, legacyModel, requestParams } = claudeInstantAssertion

        expect(provider.id).toBe(providerId)
        expect(provider.legacyModel).toBe(legacyModel)
        expect(getRequestParamsWithoutMessages(provider)).toStrictEqual({
            ...requestParams,
            // The model ID is ignored by BYOK clients
            model: undefined,
        })
    })

    it('throws if the wrong "completionModel" separator is used', async () => {
        const createCall = getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'anthropic/claude-instant-1.2',
            provider: 'aws-bedrock',
            isDotCom: false,
        })

        await expect(createCall).rejects.toThrowErrorMatchingInlineSnapshot(
            `[Error: Failed to create "anthropic/claude-instant-1" autocomplete provider derived from "site-config-cody-llm-configuration". Please check your site configuration for autocomplete: https://sourcegraph.com/docs/cody/capabilities/autocomplete.]`
        )
    })

    it('throws if completionModel does not have a model name', async () => {
        const createCall = getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'anthropic.',
            provider: 'aws-bedrock',
            isDotCom: false,
        })

        await expect(createCall).rejects.toThrowErrorMatchingInlineSnapshot(
            `[Error: Failed to parse the model name 'anthropic.' for 'aws-bedrock' completions provider.]`
        )
    })

    it('throws if completionModel does not have a provider ID', async () => {
        const createCall = getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
            completionModel: 'hello-world',
            provider: 'aws-bedrock',
            isDotCom: false,
        })

        await expect(createCall).rejects.toThrowErrorMatchingInlineSnapshot(
            `[Error: Failed to parse the model name 'hello-world' for 'aws-bedrock' completions provider.]`
        )
    })
})
