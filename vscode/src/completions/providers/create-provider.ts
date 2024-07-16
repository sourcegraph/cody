import {
    type AuthStatus,
    type CodeCompletionsClient,
    type ConfigurationWithAccessToken,
    FeatureFlag,
    type Model,
    ModelUsage,
    ModelsService,
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
    CODE_QWEN_7B,
    DEEPSEEK_CODER_7B,
    DEEPSEEK_CODER_V2_LITE_BASE,
    FIREWORKS_DEEPSEEK_7B_LANG_LOG_FINETUNED,
    FIREWORKS_DEEPSEEK_7B_LANG_STACK_FINETUNED,
    FIREWORKS_FIM_FINE_TUNED_MODEL_HYBRID,
    type FireworksOptions,
    createProviderConfig as createFireworksProviderConfig,
} from './fireworks'
import { createProviderConfig as createGeminiProviderConfig } from './google'
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
        case 'azure-openai':
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
        case 'gemini':
        case 'unstable-gemini': {
            return createGeminiProviderConfig({ client, model })
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
    const info = getAutocompleteModelInfo(authStatus)
    if (!info) {
        /**
         * If autocomplete provider is not defined neither in VSCode nor in Sourcegraph instance site config,
         * use the default provider config ("anthropic").
         */
        return createAnthropicProviderConfig({ client })
    }
    if (info instanceof Error) {
        logError('createProviderConfig', info.message)
        return null
    }
    /**
     * If autocomplete provider is not defined in the VSCode settings,
     * check the completions provider in the connected Sourcegraph instance site config
     * and return the matching provider config.
     */
    const { provider, modelId, model } = info
    switch (provider) {
        case 'openai':
        case 'azure-openai':
            return createUnstableOpenAIProviderConfig({
                client,
                // Model name for azure openai provider is a deployment name. It shouldn't appear in logs.
                model: provider === 'azure-openai' && modelId ? '' : modelId,
            })

        case 'fireworks':
            return createFireworksProviderConfig({
                client,
                timeouts: config.autocompleteTimeouts,
                model: modelId ?? null,
                authStatus,
                config,
            })
        case 'experimental-openaicompatible':
            return createOpenAICompatibleProviderConfig({
                client,
                timeouts: config.autocompleteTimeouts,
                model: modelId ?? null,
                authStatus,
                config,
            })
        case 'openaicompatible-v2':
            if (model) {
                return createOpenAICompatibleProviderConfig({
                    client,
                    timeouts: config.autocompleteTimeouts,
                    model: modelId ?? null,
                    authStatus,
                    config,
                })
            }
            logError(
                'createProviderConfig',
                'Model definition is missing for openaicompatible-v2 provider.',
                modelId
            )
            return null
        case 'aws-bedrock':
        case 'anthropic':
            return createAnthropicProviderConfig({
                client,
                // Only pass through the upstream-defined model if we're using Cody Gateway
                model:
                    authStatus.configOverwrites?.provider === 'sourcegraph'
                        ? authStatus.configOverwrites.completionModel
                        : undefined,
            })
        case 'google':
            if (authStatus.configOverwrites?.completionModel?.includes('claude')) {
                return createAnthropicProviderConfig({
                    client, // Model name for google provider is a deployment name. It shouldn't appear in logs.
                    model: undefined,
                })
            }
            // Gemini models
            return createGeminiProviderConfig({ client, model: modelId })
        default:
            logError('createProviderConfig', `Unrecognized provider '${provider}' configured.`)
            return null
    }
}

async function resolveFIMModelExperimentFromFeatureFlags(): ReturnType<
    typeof resolveDefaultModelFromVSCodeConfigOrFeatureFlags
> {
    /**
     * The traffic allocated to the fine-tuned-base feature flag is further split between multiple feature flag in function.
     */
    const [
        fimModelControl,
        fimModelVariant1,
        fimModelVariant2,
        fimModelVariant3,
        fimModelVariant4,
        fimModelCurrentBest,
    ] = await Promise.all([
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteFIMModelExperimentControl),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteFIMModelExperimentVariant1),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteFIMModelExperimentVariant2),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteFIMModelExperimentVariant3),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteFIMModelExperimentVariant4),
        featureFlagProvider.evaluateFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentCurrentBest
        ),
    ])

    if (fimModelVariant1) {
        // Variant 1: Current production model with +200msec latency to quantity the effect of latency increase while keeping same quality
        return { provider: 'fireworks', model: DEEPSEEK_CODER_V2_LITE_BASE }
    }
    if (fimModelVariant2) {
        return { provider: 'fireworks', model: FIREWORKS_DEEPSEEK_7B_LANG_LOG_FINETUNED }
    }
    if (fimModelVariant3) {
        return { provider: 'fireworks', model: CODE_QWEN_7B }
    }
    if (fimModelVariant4) {
        return { provider: 'fireworks', model: FIREWORKS_DEEPSEEK_7B_LANG_STACK_FINETUNED }
    }
    if (fimModelCurrentBest) {
        return { provider: 'fireworks', model: DEEPSEEK_CODER_7B }
    }
    if (fimModelControl) {
        // Current production model
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

    const [starCoder2Hybrid, starCoderHybrid, claude3, finetunedFIMModelHybrid, fimModelExperimentFlag] =
        await Promise.all([
            featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteStarCoder2Hybrid),
            featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteStarCoderHybrid),
            featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteClaude3),
            featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteFIMFineTunedModelHybrid),
            featureFlagProvider.evaluateFeatureFlag(
                FeatureFlag.CodyAutocompleteFIMModelExperimentBaseFeatureFlag
            ),
        ])

    // We run fine tuning experiment for VSC client only.
    // We disable for all agent clients like the JetBrains plugin.
    const isFinetuningExperimentDisabled = vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.advanced.agent.running', false)

    if (!isFinetuningExperimentDisabled && fimModelExperimentFlag) {
        // The traffic in this feature flag is interpreted as a traffic allocated to the fine-tuned experiment.
        return resolveFIMModelExperimentFromFeatureFlags()
    }

    if (finetunedFIMModelHybrid) {
        return { provider: 'fireworks', model: FIREWORKS_FIM_FINE_TUNED_MODEL_HYBRID }
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

interface AutocompleteModelInfo {
    provider: string
    modelId?: string
    model?: Model
}

function getAutocompleteModelInfo(authStatus: AuthStatus): AutocompleteModelInfo | Error | undefined {
    const model = ModelsService.getDefaultModel(ModelUsage.Autocomplete, authStatus)
    if (model) {
        let provider = model.provider
        if (model.clientSideConfig?.openAICompatible) {
            provider = 'openaicompatible-v2'
        }
        return { provider, modelId: model.model, model }
    }
    if (authStatus.configOverwrites?.provider) {
        return parseProviderAndModel({
            provider: authStatus.configOverwrites.provider,
            modelId: authStatus.configOverwrites.completionModel,
        })
    }

    // If no provider info specified, return undefined to fall back to default provider
    return
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
    modelId,
}: {
    provider: string
    modelId?: string
}): AutocompleteModelInfo | Error {
    const delimiter = delimiters[provider]
    if (!delimiter) {
        return { provider, modelId }
    }

    if (modelId) {
        const index = modelId.indexOf(delimiter)
        const parsedProvider = modelId.slice(0, index)
        const parsedModel = modelId.slice(index + 1)
        if (parsedProvider && parsedModel) {
            return { provider: parsedProvider, modelId: parsedModel }
        }
    }

    return new Error(
        (modelId
            ? `Failed to parse the model name ${modelId}`
            : `Model missing but delimiter ${delimiter} expected`) +
            `for '${provider}' completions provider.`
    )
}
