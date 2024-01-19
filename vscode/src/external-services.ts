import type * as vscode from 'vscode'

import {
    ChatClient,
    CodebaseContext,
    SourcegraphGuardrailsClient,
    SourcegraphIntentDetectorClient,
    graphqlClient,
    isError,
    type CodeCompletionsClient,
    type ConfigurationWithAccessToken,
    type Editor,
    type Guardrails,
    type IntentDetector,
    isDotCom,
} from '@sourcegraph/cody-shared'

import { createClient as createCodeCompletionsClient } from './completions/client'
import type { PlatformContext } from './extension.common'
import type { LocalEmbeddingsConfig, LocalEmbeddingsController } from './local-context/local-embeddings'
import type { SymfRunner } from './local-context/symf'
import { logDebug, logger } from './log'

interface ExternalServices {
    intentDetector: IntentDetector
    codebaseContext: CodebaseContext
    chatClient: ChatClient
    codeCompletionsClient: CodeCompletionsClient
    guardrails: Guardrails
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
    | 'experimentalTracing'
> &
    LocalEmbeddingsConfig

export async function configureExternalServices(
    context: vscode.ExtensionContext,
    initialConfig: ExternalServicesConfiguration,
    editor: Editor,
    platform: Pick<
        PlatformContext,
        | 'createLocalEmbeddingsController'
        | 'createCompletionsClient'
        | 'createSentryService'
        | 'createOpenTelemetryService'
        | 'createSymfRunner'
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

    const isConsumer = isDotCom(initialConfig.serverEndpoint)
    const localEmbeddings = platform.createLocalEmbeddingsController?.(initialConfig)

    const chatClient = new ChatClient(completionsClient)
    const codebaseContext = new CodebaseContext(
        initialConfig,
        initialConfig.codebase,
        isConsumer ? localEmbeddings : undefined,
        isConsumer ? symfRunner : undefined
    )

    const guardrails = new SourcegraphGuardrailsClient(graphqlClient)

    return {
        intentDetector: new SourcegraphIntentDetectorClient(completionsClient),
        codebaseContext,
        chatClient,
        codeCompletionsClient,
        guardrails,
        localEmbeddings,
        symfRunner,
        onConfigurationChange: newConfig => {
            sentryService?.onConfigurationChange(newConfig)
            openTelemetryService?.onConfigurationChange(newConfig)
            completionsClient.onConfigurationChange(newConfig)
            codeCompletionsClient.onConfigurationChange(newConfig)
            codebaseContext.onConfigurationChange(newConfig)
            void localEmbeddings?.setAccessToken(newConfig.serverEndpoint, newConfig.accessToken)
        },
    }
}
