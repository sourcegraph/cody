import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { FeatureFlag, FeatureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { CodyLLMSiteConfiguration } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'

import { logError } from '../../log'
import { CodeCompletionsClient } from '../client'

import { createProviderConfig as createAnthropicProviderConfig } from './anthropic'
import { ProviderConfig } from './provider'
import { createProviderConfig as createUnstableAzureOpenAiProviderConfig } from './unstable-azure-openai'
import { createProviderConfig as createUnstableCodeGenProviderConfig } from './unstable-codegen'
import { createProviderConfig as createUnstableFireworksProviderConfig } from './unstable-fireworks'
import { createProviderConfig as createUnstableOpenAIProviderConfig } from './unstable-openai'

const DEFAULT_PROVIDER: { provider: string; model?: string } = { provider: 'anthropic' }

export async function createProviderConfig(
    config: Configuration,
    client: CodeCompletionsClient,
    featureFlagProvider: FeatureFlagProvider,
    codyLLMSiteConfig?: CodyLLMSiteConfiguration
): Promise<ProviderConfig | null> {
    const providerFromVSCodeConfig = await resolveDefaultProviderFromVSCodeConfig(
        config.autocompleteAdvancedProvider,
        featureFlagProvider
    )
    if (providerFromVSCodeConfig) {
        const { provider, model } = providerFromVSCodeConfig

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
            case 'unstable-openai': {
                return createUnstableOpenAIProviderConfig({
                    client,
                    contextWindowTokens: 2048,
                })
            }
            case 'unstable-fireworks': {
                return createUnstableFireworksProviderConfig({
                    client,
                    model: config.autocompleteAdvancedModel ?? model ?? null,
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

    const providerFromSiteConfig = codyLLMSiteConfig ? resolveDefaultProviderFromSiteConfig(codyLLMSiteConfig) : null
    if (providerFromSiteConfig) {
        const { provider, model } = providerFromSiteConfig

        switch (provider) {
            case 'openai':
            case 'azure-openai':
                return createUnstableOpenAIProviderConfig({
                    client,
                    contextWindowTokens: 2048,
                    model,
                })

            case 'fireworks':
                return createUnstableFireworksProviderConfig({
                    client,
                    model: model ?? null,
                })
            case 'anthropic':
            case 'sourcegraph':
                return createAnthropicProviderConfig({
                    client,
                    contextWindowTokens: 2048,
                    mode: config.autocompleteAdvancedModel === 'claude-instant-infill' ? 'infill' : 'default',
                    // TODO: pass model name if provider is anthropic
                    // model: provider === 'anthropic' ? model : undefined,
                })
            default:
                logError('createProviderConfig', `Unrecognized provider '${provider}' configured.`)
                return null
        }
    }

    // TODO: return default provider (anthropic) config instead
    return null
}

async function resolveDefaultProviderFromVSCodeConfig(
    configuredProvider: string | null,
    featureFlagProvider?: FeatureFlagProvider
): Promise<{ provider: string; model?: 'starcoder-7b' | 'starcoder-16b' | 'claude-instant-infill' } | null> {
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

    return null
}

function resolveDefaultProviderFromSiteConfig({
    provider,
    completionModel,
}: CodyLLMSiteConfiguration): { provider: string; model?: string } | null {
    if (provider && provider !== 'sourcegraph') {
        // https://github.com/sourcegraph/sourcegraph/blob/83166945fa80c009dd7d13b7ff97e4c7df000180/internal/conf/computed.go#L592-L601
        return { provider, model: completionModel }
    }
    return null
}
