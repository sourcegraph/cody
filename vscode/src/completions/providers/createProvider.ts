import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { FeatureFlag, FeatureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'

import { logError } from '../../log'
import { AuthProvider } from '../../services/AuthProvider'
import { CodeCompletionsClient } from '../client'

import { createProviderConfig as createAnthropicProviderConfig } from './anthropic'
import { ProviderConfig } from './provider'
import { createProviderConfig as createUnstableAzureOpenAiProviderConfig } from './unstable-azure-openai'
import { createProviderConfig as createUnstableCodeGenProviderConfig } from './unstable-codegen'
import { createProviderConfig as createUnstableFireworksProviderConfig } from './unstable-fireworks'
import { createProviderConfig as createUnstableOpenAIProviderConfig } from './unstable-openai'

export async function createProviderConfig(
    config: Configuration,
    client: CodeCompletionsClient,
    featureFlagProvider: FeatureFlagProvider,
    authProvider: AuthProvider
): Promise<ProviderConfig | null> {
    const { provider, model } = await resolveDefaultProvider(
        config.autocompleteAdvancedProvider,
        featureFlagProvider,
        authProvider
    )
    switch (provider) {
        case 'unstable-codegen': {
            if (config.autocompleteAdvancedServerEndpoint !== null) {
                return createUnstableCodeGenProviderConfig(config.autocompleteAdvancedServerEndpoint)
            }

            logError(
                'createProviderConfig',
                'Provider `unstable-codegen` can not be used without configuring `cody.autocomplete.advanced.serverEndpoint`.'
            )
            return null
        }
        case 'unstable-azure-openai': {
            if (config.autocompleteAdvancedServerEndpoint === null) {
                logError(
                    'createProviderConfig',
                    'Provider `unstable-azure-openai` can not be used without configuring `cody.autocomplete.advanced.serverEndpoint`.'
                )
                return null
            }

            if (config.autocompleteAdvancedAccessToken === null) {
                logError(
                    'createProviderConfig',
                    'Provider `unstable-azure-openai` can not be used without configuring `cody.autocomplete.advanced.accessToken`.'
                )
                return null
            }

            return createUnstableAzureOpenAiProviderConfig({
                serverEndpoint: config.autocompleteAdvancedServerEndpoint,
                accessToken: config.autocompleteAdvancedAccessToken,
            })
        }
        case 'openai':
        case 'azure-openai':
        case 'unstable-openai': {
            return createUnstableOpenAIProviderConfig({
                client,
                contextWindowTokens: 2048,
                // "unstable-openai" provider doesn't support setting a model.
                // Pass model only if provider comes from the instance site config.
                model: provider !== 'unstable-openai' ? model : undefined,
            })
        }
        case 'fireworks':
        case 'unstable-fireworks': {
            return createUnstableFireworksProviderConfig({
                client,
                // if completions provider comes from the instance site config, ignore advanced model value from the VSCode settings
                model: (provider === 'unstable-fireworks' ? config.autocompleteAdvancedModel : null) ?? model ?? null,
            })
        }
        case 'anthropic': {
            return createAnthropicProviderConfig({
                client,
                contextWindowTokens: 2048,
                mode: config.autocompleteAdvancedModel === 'claude-instant-infill' ? 'infill' : 'default',
            })
        }
        default:
            logError(
                'createProviderConfig',
                `Unrecognized provider '${config.autocompleteAdvancedProvider}' configured.`
            )
            return null
    }
}

async function resolveDefaultProvider(
    configuredProvider: string | null,
    featureFlagProvider: FeatureFlagProvider,
    authProvider: AuthProvider
): Promise<{ provider: string; model?: string }> {
    if (configuredProvider) {
        return { provider: configuredProvider }
    }

    const [starCoder7b, starCoder16b, claudeInstantInfill] = await Promise.all([
        featureFlagProvider?.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteStarCoder7B),
        featureFlagProvider?.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteStarCoder16B),
        featureFlagProvider?.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteClaudeInstantInfill),
    ])

    if (starCoder7b === true || starCoder16b === true) {
        return { provider: 'unstable-fireworks', model: starCoder7b ? 'starcoder-7b' : 'starcoder-16b' }
    }

    if (claudeInstantInfill === true) {
        return { provider: 'anthropic', model: 'claude-instant-infill' }
    }

    const codyLLMSiteConfigOverwrites = authProvider.getAuthStatus().configOverwrites
    const provider = codyLLMSiteConfigOverwrites?.provider
    const model = codyLLMSiteConfigOverwrites?.completionModel
    if (provider && provider !== 'sourcegraph') {
        // https://github.com/sourcegraph/sourcegraph/blob/83166945fa80c009dd7d13b7ff97e4c7df000180/internal/conf/computed.go#L592-L601
        return { provider, model }
    }

    return { provider: 'anthropic' }
}
