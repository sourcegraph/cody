import {
    type ClientConfigurationWithAccessToken,
    type Model,
    currentAuthStatusAuthed,
} from '@sourcegraph/cody-shared'

import { Observable, map } from 'observable-fns'
import { logError } from '../../log'
import { localStorage } from '../../services/LocalStorageProvider'
import { createProvider as createAnthropicProvider } from './anthropic'
import { createProvider as createExperimentalOllamaProvider } from './experimental-ollama'
import { createProvider as createExperimentalOpenAICompatibleProvider } from './expopenaicompatible'
import { createProvider as createFireworksProvider } from './fireworks'
import { getExperimentModel } from './get-experiment-model'
import { getModelInfo } from './get-model-info'
import { createProvider as createGeminiProviderConfig } from './google'
import { createProvider as createOpenAICompatibleProviderConfig } from './openaicompatible'
import type { Provider, ProviderFactory } from './provider'
import { createProvider as createUnstableOpenAIProviderConfig } from './unstable-openai'

export function createProvider(config: ClientConfigurationWithAccessToken): Observable<Provider | null> {
    // Resolve the provider config from the VS Code config.
    if (config.autocompleteAdvancedProvider) {
        return Observable.of(
            createProviderHelper({
                legacyModel: config.autocompleteAdvancedModel || undefined,
                provider: config.autocompleteAdvancedProvider,
                config,
            })
        )
    }

    return getExperimentModel().pipe(
        map(configFromFeatureFlags => {
            // Check if a user participates in autocomplete model experiments, and use the
            // experiment model if available.
            if (configFromFeatureFlags) {
                return createProviderHelper({
                    legacyModel: configFromFeatureFlags.model,
                    provider: configFromFeatureFlags.provider,
                    config,
                })
            }

            const modelInfoOrError = getModelInfo()

            if (modelInfoOrError instanceof Error) {
                logError('createProvider', modelInfoOrError.message)
                return null
            }

            const { provider, legacyModel, model } = modelInfoOrError

            return createProviderHelper({
                legacyModel,
                model,
                provider,
                config,
            })
        })
    )
}

interface CreateConfigHelperParams {
    legacyModel: string | undefined
    provider: string
    config: ClientConfigurationWithAccessToken
    model?: Model
}

export function createProviderHelper(params: CreateConfigHelperParams): Provider | null {
    const { legacyModel, model, provider, config } = params
    const anonymousUserID = localStorage.anonymousUserID()

    const providerCreator = getProviderCreator({
        provider: provider as AutocompleteProviderID,
    })

    if (providerCreator) {
        return providerCreator({
            model,
            legacyModel: legacyModel,
            config,
            anonymousUserID,
            provider,
        })
    }

    return null
}

interface GetProviderCreatorParams {
    provider: AutocompleteProviderID
}

function getProviderCreator(params: GetProviderCreatorParams): ProviderFactory | null {
    const { provider } = params

    if (provider === AUTOCOMPLETE_PROVIDER_ID.fireworks) {
        return createFireworksProvider
    }

    if (provider === AUTOCOMPLETE_PROVIDER_ID.openaicompatible) {
        return createOpenAICompatibleProviderConfig
    }

    if (
        provider === AUTOCOMPLETE_PROVIDER_ID.openai ||
        provider === AUTOCOMPLETE_PROVIDER_ID['unstable-openai'] ||
        provider === AUTOCOMPLETE_PROVIDER_ID['azure-openai']
    ) {
        return createUnstableOpenAIProviderConfig
    }

    if (provider === AUTOCOMPLETE_PROVIDER_ID['experimental-openaicompatible']) {
        return createExperimentalOpenAICompatibleProvider
    }

    const { configOverwrites } = currentAuthStatusAuthed()

    if (
        provider === AUTOCOMPLETE_PROVIDER_ID.anthropic ||
        provider === AUTOCOMPLETE_PROVIDER_ID['aws-bedrock'] ||
        // An exception where we have to check the completion model string in addition to the provider ID.
        (provider === AUTOCOMPLETE_PROVIDER_ID.google &&
            configOverwrites?.completionModel?.includes('claude'))
    ) {
        return createAnthropicProvider
    }

    if (
        provider === AUTOCOMPLETE_PROVIDER_ID.google ||
        provider === AUTOCOMPLETE_PROVIDER_ID.gemini ||
        provider === AUTOCOMPLETE_PROVIDER_ID['unstable-gemini']
    ) {
        return createGeminiProviderConfig
    }

    if (
        provider === AUTOCOMPLETE_PROVIDER_ID['experimental-ollama'] ||
        provider === AUTOCOMPLETE_PROVIDER_ID['unstable-ollama']
    ) {
        return createExperimentalOllamaProvider
    }

    logError('createProvider', `Unrecognized provider '${provider}' configured.`)
    return null
}

export type AutocompleteProviderID = keyof typeof AUTOCOMPLETE_PROVIDER_ID

export const AUTOCOMPLETE_PROVIDER_ID = {
    /**
     * Cody talking to Fireworks official API.
     * https://docs.fireworks.ai/api-reference/introduction
     */
    fireworks: 'fireworks',

    /**
     * Cody talking to openai compatible API.
     * We plan to use this provider instead of all the existing openai-related providers.
     */
    openaicompatible: 'openaicompatible',

    /**
     * Cody talking to OpenAI's official public API.
     * https://platform.openai.com/docs/api-reference/introduction
     */
    openai: 'openai',

    /**
     * Cody talking to OpenAI's official public API.
     * https://platform.openai.com/docs/api-reference/introduction
     *
     * @deprecated use `openai` instead
     */
    'unstable-openai': 'unstable-openai',

    /**
     * Cody talking to OpenAI through Microsoft Azure's API (they re-sell the OpenAI API, but slightly modified).
     *
     * @deprecated use `openai` instead
     */
    'azure-openai': 'azure-openai',

    /**
     * Cody talking to customer's custom proxy service.
     *
     * TODO(slimsag): self-hosted models: deprecate and remove this
     * once customers are upgraded to non-experimental version.
     *
     * @deprecated use `openaicompatible` instead
     */
    'experimental-openaicompatible': 'experimental-openaicompatible',

    /**
     * This refers to either Anthropic models re-sold by AWS,
     * or to other models hosted by AWS' Bedrock inference API service
     */
    'aws-bedrock': 'aws-bedrock',

    /**
     * Cody talking to Anthropic's official public API.
     * https://docs.anthropic.com/en/api/getting-started
     */
    anthropic: 'anthropic',

    /**
     * Cody talking to Google's APIs for models created by Google, which include:
     * - their public Gemini API
     * - their GCP Gemini API
     * - GCP Vertex API
     * - Anthropic-reselling APIs
     */
    google: 'google',

    /**
     * Cody talking to Google's APIs for models created by Google, which include:
     * - their public Gemini API
     * - their GCP Gemini API
     * - GCP Vertex API
     */
    gemini: 'gemini',

    /**
     * Cody talking to Google's APIs for models created by Google, which include:
     * - their public Gemini API
     * - their GCP Gemini API
     * - GCP Vertex API
     *
     * @deprecated use `gemini` instead.
     */
    'unstable-gemini': 'unstable-gemini',

    /**
     * Cody talking to Ollama's official public API.
     * https://ollama.ai/docs/api
     */
    'experimental-ollama': 'experimental-ollama',

    /**
     * Cody talking to Ollama's official public API.
     * https://ollama.ai/docs/api
     *
     * @deprecated use `experimental-ollama` instead.
     */
    'unstable-ollama': 'unstable-ollama',
} as const
