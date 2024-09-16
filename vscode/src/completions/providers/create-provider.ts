import {
    type ClientConfigurationWithAccessToken,
    type Model,
    ModelUsage,
    currentAuthStatusAuthed,
    modelsService,
} from '@sourcegraph/cody-shared'

import { Observable } from 'observable-fns'
import { logError } from '../../log'
import { localStorage } from '../../services/LocalStorageProvider'
import { createProvider as createAnthropicProvider } from './anthropic'
import { createProvider as createExperimentalOllamaProvider } from './experimental-ollama'
import { createProvider as createExperimentalOpenAICompatibleProvider } from './expopenaicompatible'
import { createProvider as createFireworksProvider } from './fireworks'
import { getDotComExperimentModel } from './get-experiment-model'
import { createProvider as createGeminiProviderConfig } from './google'
import { createProvider as createOpenAICompatibleProviderConfig } from './openaicompatible'
import { parseProviderAndModel } from './parse-provider-and-model'
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
                source: 'local-editor-settings',
            })
        )
    }

    return getDotComExperimentModel().map(dotComExperiment => {
        // Check if a user participates in autocomplete experiments.
        if (dotComExperiment) {
            return createProviderHelper({
                legacyModel: dotComExperiment.model,
                provider: dotComExperiment.provider,
                config,
                source: 'dotcom-feature-flags',
            })
        }

        // Check if server-side model configuration is available.
        const model = modelsService.instance!.getDefaultModel(ModelUsage.Autocomplete)

        if (model) {
            const provider = model.clientSideConfig?.openAICompatible
                ? 'openaicompatible'
                : model.provider

            return createProviderHelper({
                legacyModel: model.id,
                model,
                provider,
                config,
                source: 'server-side-model-config',
            })
        }

        // Fallback to site-config Cody LLM configuration.
        const { configOverwrites } = currentAuthStatusAuthed()

        if (configOverwrites?.provider) {
            const parsedProviderAndModel = parseProviderAndModel({
                provider: configOverwrites.provider,
                legacyModel: configOverwrites.completionModel,
            })

            if (parsedProviderAndModel instanceof Error) {
                logError('createProvider', parsedProviderAndModel.message)
                return null
            }

            return createProviderHelper({
                ...parsedProviderAndModel,
                config,
                source: 'site-config-cody-llm-configuration',
            })
        }

        logError(
            'createProvider',
            'Failed to get autocomplete provider. Please configure the `completionModel` using site configuration.'
        )
        return null
    })
}

interface CreateConfigHelperParams {
    legacyModel: string | undefined
    provider: string
    config: ClientConfigurationWithAccessToken
    model?: Model
    source: AutocompleteProviderConfigSource
}

export function createProviderHelper(params: CreateConfigHelperParams): Provider | null {
    const { legacyModel, model, provider, config, source } = params
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
            provider: provider as AutocompleteProviderID,
            source,
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

/**
 * Config sources are listed in the order of precedence.
 */
export const AUTOCOMPLETE_PROVIDER_CONFIG_SOURCE = {
    /**
     * Local user configuration. Used to switch from the remote default to ollama and potentially other local providers.
     */
    'local-editor-settings': 'local-editor-settings',

    /**
     * Used only on DotCom for A/B testing new models.
     */
    'dotcom-feature-flags': 'dotcom-feature-flags',

    /**
     * The server-side models configuration API we intend to migrate to. Currently used only by a handful of enterprise customers.
     * See {@link RestClient.getAvailableModels} for more details.
     */
    'server-side-model-config': 'server-side-model-config',

    /**
     * The old way of configuring models.
     * See {@link SourcegraphGraphQLAPIClient.getCodyLLMConfiguration} for more details.
     */
    'site-config-cody-llm-configuration': 'site-config-cody-llm-configuration',
} as const

export type AutocompleteProviderConfigSource = keyof typeof AUTOCOMPLETE_PROVIDER_CONFIG_SOURCE
