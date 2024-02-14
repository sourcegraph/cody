import type * as vscode from 'vscode'

import {
    ChatClient,
    SourcegraphGuardrailsClient,
    SourcegraphIntentDetectorClient,
    graphqlClient,
    isError,
    type CodeCompletionsClient,
    type ConfigurationWithAccessToken,
    type Guardrails,
    type IntentDetector,
} from '@sourcegraph/cody-shared'

import { createClient as createCodeCompletionsClient } from './completions/client'
import type { PlatformContext } from './extension.common'
import type { LocalEmbeddingsConfig, LocalEmbeddingsController } from './local-context/local-embeddings'
import type { SymfRunner } from './local-context/symf'
import { logDebug, logger } from './log'
import { ContextRankingController } from './local-context/context-ranking'

interface ExternalServices {
    intentDetector: IntentDetector
    chatClient: ChatClient
    codeCompletionsClient: CodeCompletionsClient
    guardrails: Guardrails
    contextRanking: ContextRankingController | undefined
    localEmbeddings: LocalEmbeddingsController | undefined
    symfRunner: SymfRunner | undefined

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
    | 'debugEnable'
    | 'debugVerbose'
    | 'experimentalTracing'
> &
    LocalEmbeddingsConfig

export async function configureExternalServices(
    context: vscode.ExtensionContext,
    initialConfig: ExternalServicesConfiguration,
    platform: Pick<
        PlatformContext,
        | 'createLocalEmbeddingsController'
        | 'createCompletionsClient'
        | 'createSentryService'
        | 'createOpenTelemetryService'
        | 'createSymfRunner'
        | 'createContextRankingController'
    >
): Promise<ExternalServices> {
    const sentryService = platform.createSentryService?.(initialConfig)
    const openTelemetryService = platform.createOpenTelemetryService?.(initialConfig)
    const completionsClient = platform.createCompletionsClient(initialConfig, logger)
    const codeCompletionsClient = createCodeCompletionsClient(initialConfig, logger)

    const symfRunner = platform.createSymfRunner?.(
        context,
        initialConfig.serverEndpoint,
        initialConfig.accessToken,
        completionsClient
    )

    if (initialConfig.codebase && isError(await graphqlClient.getRepoId(initialConfig.codebase))) {
        logDebug(
            'external-services:configureExternalServices',
            `Cody could not find the '${initialConfig.codebase}' repository on your Sourcegraph instance.\nPlease check that the repository exists. You can override the repository with the "cody.codebase" setting.`
        )
    }

    const contextRanking = platform.createContextRankingController?.(initialConfig)
    const localEmbeddings = platform.createLocalEmbeddingsController?.(initialConfig)

    const chatClient = new ChatClient(completionsClient)

    const guardrails = new SourcegraphGuardrailsClient(graphqlClient)

    return {
        intentDetector: new SourcegraphIntentDetectorClient(completionsClient),
        chatClient,
        codeCompletionsClient,
        guardrails,
        localEmbeddings,
        contextRanking,
        symfRunner,
        onConfigurationChange: newConfig => {
            sentryService?.onConfigurationChange(newConfig)
            openTelemetryService?.onConfigurationChange(newConfig)
            completionsClient.onConfigurationChange(newConfig)
            codeCompletionsClient.onConfigurationChange(newConfig)
            void localEmbeddings?.setAccessToken(newConfig.serverEndpoint, newConfig.accessToken)
        },
    }
}
