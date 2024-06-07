import {
    type AuthStatus,
    type CodeCompletionsClient,
    type ConfigurationWithAccessToken,
    FeatureFlag,
    featureFlagProvider,
} from '@sourcegraph/cody-shared'

import * as vscode from 'vscode'
import { logError } from '../../log'
import {
    type AnthropicOptions,
    createProviderConfig as createAnthropicProviderConfig,
} from './anthropic'
import { createProviderConfig as createExperimentalOllamaProviderConfig } from './experimental-ollama'
import {
    FIREWORKS_FIM_FINE_TUNED_MODEL_1,
    FIREWORKS_FIM_FINE_TUNED_MODEL_2,
    FIREWORKS_FIM_FINE_TUNED_MODEL_3,
    FIREWORKS_FIM_FINE_TUNED_MODEL_4,
    type FireworksOptions,
    createProviderConfig as createFireworksProviderConfig,
} from './fireworks'
import { createProviderConfig as createOpenAICompatibleProviderConfig } from './openaicompatible'
import type { ProviderConfig } from './provider'
import { createProviderConfig as createUnstableOpenAIProviderConfig } from './unstable-openai'

export async function createProviderConfigFromVSCodeConfig(
    client: CodeCompletionsClient,
    authStatus: AuthStatus,
    model: string | undefined,
    provider: string,
    config: ConfigurationWithAccessToken
): Promise<ProviderConfig | null> {
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
            return createAnthropicProviderConfig({ client, model })
        }
        case 'experimental-openaicompatible': {
            return createOpenAICompatibleProviderConfig({
                client,
                model: config.autocompleteAdvancedModel ?? model ?? null,
                timeouts: config.autocompleteTimeouts,
                authStatus,
                config,
            })
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

export async function createProviderConfig(
    config: ConfigurationWithAccessToken,
    client: CodeCompletionsClient,
    authStatus: AuthStatus
): Promise<ProviderConfig | null> {
    /**
     * Look for the autocomplete provider in VSCode settings and return matching provider config.
     */
    const providerAndModelFromVSCodeConfig = await resolveDefaultModelFromVSCodeConfigOrFeatureFlags(
        config.autocompleteAdvancedProvider
    )
    if (providerAndModelFromVSCodeConfig) {
        const { provider, model } = providerAndModelFromVSCodeConfig
        return createProviderConfigFromVSCodeConfig(client, authStatus, model, provider, config)
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
            case 'experimental-openaicompatible':
                return createOpenAICompatibleProviderConfig({
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

async function resolveFinetunedModelFromFeatureFlags(): ReturnType<
    typeof resolveDefaultModelFromVSCodeConfigOrFeatureFlags
> {
    /**
     * The traffic allocated to the fine-tuned-base feature flag is further split between multiple feature flag in function.
     */
    const [finetuneControl, finetuneVariant1, finetuneVariant2, finetuneVariant3, finetuneVariant4] =
        await Promise.all([
            featureFlagProvider.evaluateFeatureFlag(
                FeatureFlag.CodyAutocompleteFIMFineTunedModelControl
            ),
            featureFlagProvider.evaluateFeatureFlag(
                FeatureFlag.CodyAutocompleteFIMFineTunedModelVariant1
            ),
            featureFlagProvider.evaluateFeatureFlag(
                FeatureFlag.CodyAutocompleteFIMFineTunedModelVariant2
            ),
            featureFlagProvider.evaluateFeatureFlag(
                FeatureFlag.CodyAutocompleteFIMFineTunedModelVariant3
            ),
            featureFlagProvider.evaluateFeatureFlag(
                FeatureFlag.CodyAutocompleteFIMFineTunedModelVariant4
            ),
        ])
    if (finetuneVariant1) {
        return { provider: 'fireworks', model: FIREWORKS_FIM_FINE_TUNED_MODEL_1 }
    }
    if (finetuneVariant2) {
        return { provider: 'fireworks', model: FIREWORKS_FIM_FINE_TUNED_MODEL_2 }
    }
    if (finetuneVariant3) {
        return { provider: 'fireworks', model: FIREWORKS_FIM_FINE_TUNED_MODEL_3 }
    }
    if (finetuneVariant4) {
        return { provider: 'fireworks', model: FIREWORKS_FIM_FINE_TUNED_MODEL_4 }
    }
    if (finetuneControl) {
        return { provider: 'fireworks', model: 'starcoder-hybrid' }
    }

    // Extra free traffic - redirect to the current production model which could be different than control
    return { provider: 'fireworks', model: 'starcoder-hybrid' }
}

async function resolveDefaultModelFromVSCodeConfigOrFeatureFlags(
    configuredProvider: string | null
): Promise<{
    provider: string
    model?: FireworksOptions['model'] | AnthropicOptions['model']
} | null> {
    if (configuredProvider) {
        return { provider: configuredProvider }
    }

    const [starCoder2Hybrid, starCoderHybrid, claude3, finetunedFIMModelExperiment] = await Promise.all([
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteStarCoder2Hybrid),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteStarCoderHybrid),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteClaude3),
        featureFlagProvider.evaluateFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMFineTunedModelBaseFeatureFlag
        ),
    ])

    // We run fine tuning experiment for VSC client only.
    // We disable for all agent clients like the JetBrains plugin.
    const isFinetuningExperimentDisabled = vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.advanced.agent.running', false)

    if (!isFinetuningExperimentDisabled && finetunedFIMModelExperiment) {
        // The traffic in this feature flag is interpreted as a traffic allocated to the fine-tuned experiment.
        return resolveFinetunedModelFromFeatureFlags()
    }

    if (starCoder2Hybrid) {
        return { provider: 'fireworks', model: 'starcoder2-hybrid' }
    }

    if (starCoderHybrid) {
        return { provider: 'fireworks', model: 'starcoder-hybrid' }
    }

    if (claude3) {
        return { provider: 'anthropic', model: 'anthropic/claude-3-haiku-20240307' }
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
