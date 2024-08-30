import type {
    AuthenticatedAuthStatus,
    ClientConfigurationWithAccessToken,
    Model,
} from '@sourcegraph/cody-shared'

import { logError } from '../../log'
import { localStorage } from '../../services/LocalStorageProvider'
import { createProvider as createAnthropicProviderConfig } from './anthropic'
import { createProvider as createExperimentalOllamaProviderConfig } from './experimental-ollama'
import { createProvider as createExperimentalOpenAICompatibleProviderConfig } from './expopenaicompatible'
import { createProvider as createFireworksProviderConfig } from './fireworks'
import { getExperimentModel } from './get-experiment-model'
import { getModelInfo } from './get-model-info'
import { createProvider as createGeminiProviderConfig } from './google'
import { createProvider as createOpenAICompatibleProviderConfig } from './openaicompatible'
import type { Provider, ProviderFactory } from './provider'
import { createProvider as createUnstableOpenAIProviderConfig } from './unstable-openai'

export async function createProvider(
    config: ClientConfigurationWithAccessToken,
    authStatus: AuthenticatedAuthStatus
): Promise<Provider | null> {
    // Resolve the provider config from the VS Code config.
    if (config.autocompleteAdvancedProvider) {
        return createProviderHelper({
            authStatus,
            modelId: config.autocompleteAdvancedModel || undefined,
            provider: config.autocompleteAdvancedProvider,
            config,
        })
    }

    // Check if a user participates in autocomplete model experiments.
    const configFromFeatureFlags = await getExperimentModel(isDotCom(authStatus))

    // Use the experiment model if available.
    if (configFromFeatureFlags) {
        return createProviderHelper({
            authStatus,
            modelId: configFromFeatureFlags.model,
            provider: configFromFeatureFlags.provider,
            config,
        })
    }

    const modelInfoOrError = getModelInfo(authStatus)

    if (modelInfoOrError instanceof Error) {
        logError('createProvider', modelInfoOrError.message)
        return null
    }

    const { provider, modelId, model } = modelInfoOrError

    return createProviderHelper({
        authStatus,
        modelId,
        model,
        provider,
        config,
    })
}

interface CreateConfigHelperParams {
    authStatus: AuthenticatedAuthStatus
    modelId: string | undefined
    provider: string
    config: ClientConfigurationWithAccessToken
    model?: Model
}

export function createProviderHelper(params: CreateConfigHelperParams): Provider | null {
    const { authStatus, modelId, model, provider, config } = params
    const { anonymousUserID } = localStorage.anonymousUserID()

    const providerCreator = getProviderCreator({
        provider,
        authStatus,
    })

    if (providerCreator) {
        return providerCreator({
            model,
            legacyModel: modelId,
            authStatus,
            config,
            anonymousUserID,
            provider,
        })
    }

    return null
}

interface GetProviderCreatorParams {
    provider: string
    authStatus: AuthenticatedAuthStatus
}

function getProviderCreator(params: GetProviderCreatorParams): ProviderFactory | null {
    const { provider, authStatus } = params

    // Cody talking to Fireworks official API.
    // https://docs.fireworks.ai/api-reference/introduction
    if (provider === 'fireworks') {
        return createFireworksProviderConfig
    }

    // Cody talking to openai compatible API.
    // We plan to use this provider instead of all the existing openai-related providers.
    if (provider === 'openaicompatible') {
        return createOpenAICompatibleProviderConfig
    }

    if (
        [
            // Cody talking to OpenAI's official public API.
            'openai',
            // Cody talking to OpenAI's official public API.
            'unstable-openai',
            // Cody talking to OpenAI through Microsoft Azure's API (they re-sell the OpenAI API, but slightly modified).
            'azure-openai',
        ].includes(provider)
    ) {
        return createUnstableOpenAIProviderConfig
    }

    // Cody talking to customer's custom proxy service.
    //
    // TODO(slimsag): self-hosted-models: deprecate and remove this
    // once customers are upgraded to non-experimental version
    if (provider === 'experimental-openaicompatible') {
        return createExperimentalOpenAICompatibleProviderConfig
    }

    if (
        [
            // This refers to either Anthropic models re-sold by AWS,
            // or to other models hosted by AWS' Bedrock inference API service
            'aws-bedrock',

            // Cody talking to Anthropic's official public API.
            // https://docs.anthropic.com/en/api/getting-started
            'anthropic',
        ].includes(provider) ||
        // Cody talking to Google's Anthropic-reselling APIs.
        (provider === 'google' && authStatus.configOverwrites?.completionModel?.includes('claude'))
    ) {
        return createAnthropicProviderConfig
    }

    // Cody talking to Google's APIs for models created by Google, which include:
    // - their public Gemini API
    // - their GCP Gemini API
    // - GCP Vertex API
    if (['google', 'gemini', 'unstable-gemini'].includes(provider)) {
        return createGeminiProviderConfig
    }

    // Cody talking to the Ollama API.
    // https://ollama.com/
    if (['experimental-ollama', 'unstable-ollama'].includes(provider)) {
        return createExperimentalOllamaProviderConfig
    }

    logError('createProvider', `Unrecognized provider '${provider}' configured.`)
    return null
}
