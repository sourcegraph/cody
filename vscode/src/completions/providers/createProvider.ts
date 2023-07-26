import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { SourcegraphNodeCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/nodeClient'

import { createProviderConfig as createAnthropicProviderConfig } from './anthropic'
import { ProviderConfig } from './provider'
import { createProviderConfig as createUnstableCodeGenProviderConfig } from './unstable-codegen'
import { createProviderConfig as createUnstableHuggingFaceProviderConfig } from './unstable-huggingface'

export function createProviderConfig(
    config: Configuration,
    onError: (error: string) => void,
    completionsClient: SourcegraphNodeCompletionsClient
): ProviderConfig {
    let providerConfig: null | ProviderConfig = null
    switch (config.autocompleteAdvancedProvider) {
        case 'unstable-codegen': {
            if (config.autocompleteAdvancedServerEndpoint !== null) {
                providerConfig = createUnstableCodeGenProviderConfig({
                    serverEndpoint: config.autocompleteAdvancedServerEndpoint,
                })
                break
            }

            onError(
                'Provider `unstable-codegen` can not be used without configuring `cody.autocomplete.advanced.serverEndpoint`. Falling back to `anthropic`.'
            )
            break
        }
        case 'unstable-huggingface': {
            if (config.autocompleteAdvancedServerEndpoint !== null) {
                providerConfig = createUnstableHuggingFaceProviderConfig({
                    serverEndpoint: config.autocompleteAdvancedServerEndpoint,
                    accessToken: config.autocompleteAdvancedAccessToken,
                })
                break
            }

            onError(
                'Provider `unstable-huggingface` can not be used without configuring `cody.autocomplete.advanced.serverEndpoint`. Falling back to `anthropic`.'
            )
            break
        }
    }
    if (providerConfig) {
        return providerConfig
    }

    return createAnthropicProviderConfig({
        completionsClient,
        contextWindowTokens: 2048,
    })
}
