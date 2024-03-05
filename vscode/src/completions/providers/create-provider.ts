import {
    type CodeCompletionsClient,
    type ConfigurationWithAccessToken,
    FeatureFlag,
    featureFlagProvider,
} from '@sourcegraph/cody-shared'

import { logError } from '../../log'

import type { AuthStatus } from '../../chat/protocol'
import { createProviderConfig as createAnthropicProviderConfig } from './anthropic'
import { createProviderConfig as createExperimentalOllamaProviderConfig } from './experimental-ollama'
import {
    type FireworksOptions,
    createProviderConfig as createFireworksProviderConfig,
} from './fireworks'
import type { ProviderConfig } from './provider'
import { createProviderConfig as createUnstableOpenAIProviderConfig } from './unstable-openai'

export async function createProviderConfig(
    config: ConfigurationWithAccessToken,
    client: CodeCompletionsClient,
    authStatus: AuthStatus
): Promise<ProviderConfig | null> {
    /**
     * Look for the autocomplete provider in VSCode settings and return matching provider config.
     */
    const providerAndModelFromVSCodeConfig = await resolveDefaultProviderFromVSCodeConfigOrFeatureFlags(
        config.autocompleteAdvancedProvider
    )
    if (providerAndModelFromVSCodeConfig) {
        const { provider, model } = providerAndModelFromVSCodeConfig

        switch (provider) {
            case 'unstable-openai': {
                return createUnstableOpenAIProviderConfig({
                    client,
                })
            }
            case 'fireworks': {
                return createFireworksProviderConfig({
                    client,
                    model: config.autocompleteAdvancedModel ?? model ?? null,
                    timeouts: config.autocompleteTimeouts,
                    authStatus,
                    config,
                })
            }
            case 'anthropic': {
                return createAnthropicProviderConfig({ client })
            }
            case 'experimental-ollama':
            case 'unstable-ollama': {
                return createExperimentalOllamaProviderConfig(
                    config.autocompleteExperimentalOllamaOptions
                )
            }
            default:
                logError(
                    'createProviderConfig',
                    `Unrecognized provider '${config.autocompleteAdvancedProvider}' configured.`
                )
                return null
        }
    }

    /**
     * If autocomplete provider is not defined in the VSCode settings,
     * check the completions provider in the connected Sourcegraph instance site config
     * and return the matching provider config.
     */
    if (authStatus.configOverwrites?.provider) {
        const parsed = parseProviderAndModel({
            provider: authStatus.configOverwrites.provider,
            model: authStatus.configOverwrites.completionModel,
        })
        if (!parsed) {
            logError(
                'createProviderConfig',
                `Failed to parse the model name for '${authStatus.configOverwrites.provider}' completions provider.`
            )
            return null
        }
        const { provider, model } = parsed
        switch (provider) {
            case 'openai':
            case 'azure-openai':
                return createUnstableOpenAIProviderConfig({
                    client,
                    // Model name for azure openai provider is a deployment name. It shouldn't appear in logs.
                    model: provider === 'azure-openai' && model ? '' : model,
                })

            case 'fireworks':
                return createFireworksProviderConfig({
                    client,
                    timeouts: config.autocompleteTimeouts,
                    model: model ?? null,
                    authStatus,
                    config,
                })
            case 'aws-bedrock':
            case 'anthropic':
                return createAnthropicProviderConfig({
                    client,
                    // Only pass through the upstream-defined model if we're using Cody Gateway
                    model:
                        authStatus.configOverwrites.provider === 'sourcegraph'
                            ? authStatus.configOverwrites.completionModel
                            : undefined,
                })
            default:
                logError('createProviderConfig', `Unrecognized provider '${provider}' configured.`)
                return null
        }
    }

    /**
     * If autocomplete provider is not defined neither in VSCode nor in Sourcegraph instance site config,
     * use the default provider config ("anthropic").
     */
    return createAnthropicProviderConfig({ client })
}

async function resolveDefaultProviderFromVSCodeConfigOrFeatureFlags(
    configuredProvider: string | null
): Promise<{
    provider: string
    model?: FireworksOptions['model']
} | null> {
    if (configuredProvider) {
        return { provider: configuredProvider }
    }

    const [starCoderHybrid, llamaCode13B] = await Promise.all([
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteStarCoderHybrid),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteLlamaCode13B),
    ])

    if (llamaCode13B) {
        return { provider: 'fireworks', model: 'llama-code-13b' }
    }

    if (starCoderHybrid) {
        return { provider: 'fireworks', model: 'starcoder-hybrid' }
    }

    return null
}

const delimiters: Record<string, string> = {
    sourcegraph: '/',
    'aws-bedrock': '.',
}

/**
 * For certain completions providers configured in the Sourcegraph instance site config
 * the model name consists MODEL_PROVIDER and MODEL_NAME separated by a specific delimiter (see {@link delimiters}).
 *
 * This function checks if the given provider has a specific model naming format and:
 *   - if it does, parses the model name and returns the parsed provider and model names;
 *   - if it doesn't, returns the original provider and model names.
 *
 * E.g. for "sourcegraph" provider the completions model name consists of model provider and model name separated by "/".
 * So when received `{ provider: "sourcegraph", model: "anthropic/claude-instant-1" }` the expected output would be `{ provider: "anthropic", model: "claude-instant-1" }`.
 */
function parseProviderAndModel({
    provider,
    model,
}: {
    provider: string
    model?: string
}): { provider: string; model?: string } | null {
    const delimiter = delimiters[provider]
    if (!delimiter) {
        return { provider, model }
    }

    if (model) {
        const index = model.indexOf(delimiter)
        const parsedProvider = model.slice(0, index)
        const parsedModel = model.slice(index + 1)
        if (parsedProvider && parsedModel) {
            return { provider: parsedProvider, model: parsedModel }
        }
    }

    return null
}
