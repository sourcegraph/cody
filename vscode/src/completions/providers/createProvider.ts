import { Configuration } from '@sourcegraph/cody-shared/src/configuration'

import { debug } from '../../log'
import { CodeCompletionsClient } from '../client'

import { createProviderConfig as createAnthropicProviderConfig } from './anthropic'
import { ProviderConfig } from './provider'
import { createProviderConfig as createUnstableAzureOpenAiProviderConfig } from './unstable-azure-openai'
import { createProviderConfig as createUnstableCodeGenProviderConfig } from './unstable-codegen'
import { createProviderConfig as createUnstableFireworksProviderConfig } from './unstable-fireworks'
import { createProviderConfig as createUnstableHuggingFaceProviderConfig } from './unstable-huggingface'

export function createProviderConfig(config: Configuration, client: CodeCompletionsClient): ProviderConfig | null {
    switch (config.autocompleteAdvancedProvider) {
        case 'unstable-codegen': {
            if (config.autocompleteAdvancedServerEndpoint !== null) {
                return createUnstableCodeGenProviderConfig({
                    serverEndpoint: config.autocompleteAdvancedServerEndpoint,
                })
            }

            debug(
                'createProviderConfig',
                'Provider `unstable-codegen` can not be used without configuring `cody.autocomplete.advanced.serverEndpoint`.'
            )
            return null
        }
        case 'unstable-huggingface': {
            if (config.autocompleteAdvancedServerEndpoint !== null) {
                return createUnstableHuggingFaceProviderConfig({
                    serverEndpoint: config.autocompleteAdvancedServerEndpoint,
                    accessToken: config.autocompleteAdvancedAccessToken,
                })
            }

            debug(
                'createProviderConfig',
                'Provider `unstable-huggingface` can not be used without configuring `cody.autocomplete.advanced.serverEndpoint`.'
            )
            return null
        }
        case 'unstable-azure-openai': {
            if (config.autocompleteAdvancedServerEndpoint === null) {
                debug(
                    'createProviderConfig',
                    'Provider `unstable-azure-openai` can not be used without configuring `cody.autocomplete.advanced.serverEndpoint`.'
                )
                return null
            }

            if (config.autocompleteAdvancedAccessToken === null) {
                debug(
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
            debug('createProviderConfig', `Unrecognized provider '${config.autocompleteAdvancedProvider}' configured.`)
            return null
    }
}
