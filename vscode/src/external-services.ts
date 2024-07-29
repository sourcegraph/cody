import type * as vscode from 'vscode'

import {
    ChatClient,
    type CodeCompletionsClient,
    type ConfigurationWithAccessToken,
    type Guardrails,
    type GuardrailsClientConfig,
    type SourcegraphCompletionsClient,
    SourcegraphGuardrailsClient,
    featureFlagProvider,
    graphqlClient,
    isError,
} from '@sourcegraph/cody-shared'

import { ContextAPIClient } from './chat/context/contextAPIClient'
import { createClient as createCodeCompletionsClient } from './completions/client'
import type { ConfigWatcher } from './configwatcher'
import type { PlatformContext } from './extension.common'
import type { ContextRankerConfig } from './local-context/context-ranking'
import type { ContextRankingController } from './local-context/context-ranking'
import type { LocalEmbeddingsConfig, LocalEmbeddingsController } from './local-context/local-embeddings'
import type { SymfRunner } from './local-context/symf'
import { logDebug, logger } from './log'
import type { AuthProvider } from './services/AuthProvider'

interface ExternalServices {
    chatClient: ChatClient
    completionsClient: SourcegraphCompletionsClient
    codeCompletionsClient: CodeCompletionsClient
    guardrails: Guardrails
    contextRanking: ContextRankingController | undefined
    localEmbeddings: LocalEmbeddingsController | undefined
    symfRunner: SymfRunner | undefined
    contextAPIClient: ContextAPIClient | undefined

    /** Update configuration for all of the services in this interface. */
    onConfigurationChange: (newConfig: ExternalServicesConfiguration) => void
}

type ExternalServicesConfiguration = Pick<
    ConfigurationWithAccessToken,
    | 'serverEndpoint'
    | 'codebase'
    | 'useContext'
    | 'customHeaders'
    | 'accessToken'
    | 'debugVerbose'
    | 'experimentalTracing'
> &
    LocalEmbeddingsConfig &
    ContextRankerConfig &
    GuardrailsClientConfig

export async function configureExternalServices(
    context: vscode.ExtensionContext,
    config: ConfigWatcher<ExternalServicesConfiguration>,
    platform: Pick<
        PlatformContext,
        | 'createLocalEmbeddingsController'
        | 'createCompletionsClient'
        | 'createSentryService'
        | 'createOpenTelemetryService'
        | 'createSymfRunner'
        | 'createContextRankingController'
    >,
    authProvider: AuthProvider
): Promise<ExternalServices> {
    const initialConfig = config.get()
    const sentryService = platform.createSentryService?.(initialConfig)
    const openTelemetryService = platform.createOpenTelemetryService?.(initialConfig)
    const completionsClient = platform.createCompletionsClient(initialConfig, logger)
    const codeCompletionsClient = createCodeCompletionsClient(initialConfig, logger)

    const symfRunner = platform.createSymfRunner?.(context, config, completionsClient)

    if (initialConfig.codebase && isError(await graphqlClient.getRepoId(initialConfig.codebase))) {
        logDebug(
            'external-services:configureExternalServices',
            `Cody could not find the '${initialConfig.codebase}' repository on your Sourcegraph instance.\nPlease check that the repository exists. You can override the repository with the "cody.codebase" setting.`
        )
    }

    const contextRanking = initialConfig.experimentalChatContextRanker
        ? platform.createContextRankingController?.(initialConfig)
        : undefined

    const localEmbeddings = await platform.createLocalEmbeddingsController?.(initialConfig)

    const chatClient = new ChatClient(completionsClient, () => authProvider.getAuthStatus())

    const guardrails = new SourcegraphGuardrailsClient(graphqlClient, initialConfig)

    const contextAPIClient = new ContextAPIClient(graphqlClient, featureFlagProvider)

    return {
        chatClient,
        completionsClient,
        codeCompletionsClient,
        guardrails,
        localEmbeddings,
        contextRanking,
        symfRunner,
        contextAPIClient,
        onConfigurationChange: newConfig => {
            sentryService?.onConfigurationChange(newConfig)
            openTelemetryService?.onConfigurationChange(newConfig)
            completionsClient.onConfigurationChange(newConfig)
            codeCompletionsClient.onConfigurationChange(newConfig)
            guardrails.onConfigurationChange(newConfig)
            void localEmbeddings?.setAccessToken(newConfig.serverEndpoint, newConfig.accessToken)
            void contextRanking?.setAccessToken(newConfig.serverEndpoint, newConfig.accessToken)
        },
    }
}
