import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { FeatureFlag, FeatureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'

import { logError } from '../../log'
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
    featureFlagProvider?: FeatureFlagProvider
): Promise<ProviderConfig | null> {
    const provider = await resolveDefaultProvider(config.autocompleteAdvancedProvider, featureFlagProvider)
    switch (provider) {
        case 'unstable-codegen': {
            if (config.autocompleteAdvancedServerEndpoint !== null) {
                return createUnstableCodeGenProviderConfig({
                    serverEndpoint: config.autocompleteAdvancedServerEndpoint,
                    socksProxy: config.autocompleteAdvancedServerSocksProxy || undefined,
                })
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
                model: config.autocompleteAdvancedModel,
            })
        }
        case 'anthropic': {
            return createAnthropicProviderConfig({
                client,
                contextWindowTokens: 2048,
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
    featureFlagProvider?: FeatureFlagProvider
): Promise<string> {
    if (configuredProvider) {
        return configuredProvider
    }

    if (await featureFlagProvider?.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteDefaultProviderFireworks)) {
        return 'unstable-fireworks'
    }

    return 'anthropic'
}
