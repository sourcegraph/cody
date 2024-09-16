import type * as vscode from 'vscode'

import {
    ChatClient,
    type ClientConfigurationWithAccessToken,
    type Guardrails,
    type GuardrailsClientConfig,
    type SourcegraphCompletionsClient,
    SourcegraphGuardrailsClient,
    currentAuthStatus,
    currentAuthStatusAuthed,
    firstValueFrom,
    graphqlClient,
    isDotCom,
    isError,
    resolvedConfigWithAccessToken,
} from '@sourcegraph/cody-shared'

import { ContextAPIClient } from './chat/context/contextAPIClient'
import type { PlatformContext } from './extension.common'
import type { LocalEmbeddingsConfig, LocalEmbeddingsController } from './local-context/local-embeddings'
import type { SymfRunner } from './local-context/symf'
import { logDebug, logger } from './log'

interface ExternalServices {
    chatClient: ChatClient
    completionsClient: SourcegraphCompletionsClient
    guardrails: Guardrails
    localEmbeddings: LocalEmbeddingsController | undefined
    symfRunner: SymfRunner | undefined
    contextAPIClient: ContextAPIClient | undefined

    /** Update configuration for all of the services in this interface. */
    onConfigurationChange: (newConfig: ExternalServicesConfiguration) => void
}

type ExternalServicesConfiguration = Pick<
    ClientConfigurationWithAccessToken,
    | 'serverEndpoint'
    | 'codebase'
    | 'useContext'
    | 'customHeaders'
    | 'accessToken'
    | 'debugVerbose'
    | 'experimentalTracing'
> &
    LocalEmbeddingsConfig &
    GuardrailsClientConfig

export async function configureExternalServices(
    context: vscode.ExtensionContext,
    platform: Pick<
        PlatformContext,
        | 'createLocalEmbeddingsController'
        | 'createCompletionsClient'
        | 'createSentryService'
        | 'createOpenTelemetryService'
        | 'createSymfRunner'
    >
): Promise<ExternalServices> {
    const initialConfig = await firstValueFrom(resolvedConfigWithAccessToken)
    platform.createSentryService?.()
    platform.createOpenTelemetryService?.()
    const completionsClient = platform.createCompletionsClient(initialConfig, logger)

    const symfRunner = platform.createSymfRunner?.(context, completionsClient)

    if (initialConfig.codebase && isError(await graphqlClient.getRepoId(initialConfig.codebase))) {
        logDebug(
            'external-services:configureExternalServices',
            `Cody could not find the '${initialConfig.codebase}' repository on your Sourcegraph instance.\nPlease check that the repository exists. You can override the repository with the "cody.codebase" setting.`
        )
    }

    // Disable local embeddings for enterprise users.
    const localEmbeddings =
        currentAuthStatus().authenticated && isDotCom(currentAuthStatus())
            ? await platform.createLocalEmbeddingsController?.(initialConfig)
            : undefined

    const chatClient = new ChatClient(completionsClient, () => currentAuthStatusAuthed())

    const guardrails = new SourcegraphGuardrailsClient()

    const contextAPIClient = new ContextAPIClient(graphqlClient)

    return {
        chatClient,
        completionsClient,
        guardrails,
        localEmbeddings,
        symfRunner,
        contextAPIClient,
        onConfigurationChange: newConfig => {
            completionsClient.onConfigurationChange(newConfig)
            void localEmbeddings?.setAccessToken(newConfig.serverEndpoint, newConfig.accessToken)
        },
    }
}
