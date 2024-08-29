import type {
    AuthStatus,
    ClientConfigurationWithAccessToken,
    CodeCompletionsClient,
    Model,
} from '@sourcegraph/cody-shared'

import { logError } from '../../log'
import { localStorage } from '../../services/LocalStorageProvider'
import {
    DEFAULT_PLG_ANTHROPIC_MODEL,
    createProviderConfig as createAnthropicProviderConfig,
} from './anthropic'
import { createProviderConfig as createExperimentalOllamaProviderConfig } from './experimental-ollama'
import { createProviderConfig as createExperimentalOpenAICompatibleProviderConfig } from './expopenaicompatible'
import { createProviderConfig as createFireworksProviderConfig } from './fireworks'
import { getExperimentModel } from './get-experiment-model'
import { getModelInfo } from './get-model-info'
import { createProviderConfig as createGeminiProviderConfig } from './google'
import { createProviderConfig as createOpenAICompatibleProviderConfig } from './openaicompatible'
import type { ProviderConfig } from './provider'
import { createProviderConfig as createUnstableOpenAIProviderConfig } from './unstable-openai'

export async function createProviderConfig(
    config: ClientConfigurationWithAccessToken,
    client: CodeCompletionsClient,
    authStatus: AuthStatus
): Promise<ProviderConfig | null> {
    // Resolve the provider config from the VS Code config.
    if (config.autocompleteAdvancedProvider) {
        return createProviderConfigHelper({
            client,
            authStatus,
            modelId: config.autocompleteAdvancedModel || undefined,
            provider: config.autocompleteAdvancedProvider,
            config,
        })
    }

    // Check if a user participates in autocomplete model experiments.
    const configFromFeatureFlags = await getExperimentModel(authStatus.isDotCom)

    // Use the experiment model if available.
    if (configFromFeatureFlags) {
        return createProviderConfigHelper({
            client,
            authStatus,
            modelId: configFromFeatureFlags.model,
            provider: configFromFeatureFlags.provider,
            config,
        })
    }

    const modelInfoOrError = getModelInfo(authStatus)

    if (modelInfoOrError instanceof Error) {
        logError('createProviderConfig', modelInfoOrError.message)
        return null
    }

    const { provider, modelId, model } = modelInfoOrError

    return createProviderConfigHelper({
        client,
        authStatus,
        modelId,
        model,
        provider,
        config,
    })
}

interface CreateConfigHelperParams {
    client: CodeCompletionsClient
    authStatus: AuthStatus
    modelId: string | undefined
    provider: string
    config: ClientConfigurationWithAccessToken
    model?: Model
}

export async function createProviderConfigHelper(
    params: CreateConfigHelperParams
): Promise<ProviderConfig | null> {
    const { client, authStatus, modelId, model, provider, config } = params

    switch (provider) {
        case 'openai': {
            return createUnstableOpenAIProviderConfig({
                client,
                model: modelId,
            })
        }
        case 'azure-openai': {
            return createUnstableOpenAIProviderConfig({
                client,
                // Model name for azure openai provider is a deployment name. It shouldn't appear in logs.
                model: modelId ? '' : modelId,
            })
        }
        case 'unstable-openai': {
            return createUnstableOpenAIProviderConfig({
                client,
            })
        }
        case 'fireworks': {
            const { anonymousUserID } = localStorage.anonymousUserID()
            return createFireworksProviderConfig({
                client,
                model: modelId ?? null,
                authStatus,
                config,
                anonymousUserID,
            })
        }
        case 'experimental-openaicompatible': {
            // TODO(slimsag): self-hosted-models: deprecate and remove this once customers are upgraded
            // to non-experimental version
            return createExperimentalOpenAICompatibleProviderConfig({
                client,
                model: modelId ?? null,
                authStatus,
                config,
            })
        }
        case 'openaicompatible': {
            if (model) {
                return createOpenAICompatibleProviderConfig({
                    client,
                    model,
                    authStatus,
                    config,
                })
            }
            logError(
                'createProviderConfig',
                'Model definition is missing for openaicompatible provider.',
                modelId
            )
            return null
        }
        case 'aws-bedrock':
        case 'anthropic': {
            function getAnthropicModel() {
                // Always use the default PLG model on DotCom
                if (authStatus.isDotCom) {
                    return DEFAULT_PLG_ANTHROPIC_MODEL
                }

                // Only pass through the upstream-defined model if we're using Cody Gateway
                if (authStatus.configOverwrites?.provider === 'sourcegraph') {
                    return authStatus.configOverwrites.completionModel
                }

                return undefined
            }

            return createAnthropicProviderConfig({
                client,
                model: getAnthropicModel(),
            })
        }
        case 'google': {
            if (authStatus.configOverwrites?.completionModel?.includes('claude')) {
                return createAnthropicProviderConfig({
                    client,
                    // Model name for google provider is a deployment name. It shouldn't appear in logs.
                    model: undefined,
                })
            }
            // Gemini models
            return createGeminiProviderConfig({ client, model: modelId })
        }
        case 'gemini':
        case 'unstable-gemini': {
            return createGeminiProviderConfig({ client, model: modelId })
        }
        case 'experimental-ollama':
        case 'unstable-ollama': {
            return createExperimentalOllamaProviderConfig(config.autocompleteExperimentalOllamaOptions)
        }
        default:
            logError(
                'createProviderConfig',
                `Unrecognized provider '${config.autocompleteAdvancedProvider}' configured.`
            )
            return null
    }
}
