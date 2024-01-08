import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { Editor } from '@sourcegraph/cody-shared/src/editor'
import { SourcegraphEmbeddingsSearchClient } from '@sourcegraph/cody-shared/src/embeddings/client'
import { Guardrails } from '@sourcegraph/cody-shared/src/guardrails'
import { SourcegraphGuardrailsClient } from '@sourcegraph/cody-shared/src/guardrails/client'
import { IntentDetector } from '@sourcegraph/cody-shared/src/intent-detector'
import { SourcegraphIntentDetectorClient } from '@sourcegraph/cody-shared/src/intent-detector/client'
import { IndexedKeywordContextFetcher } from '@sourcegraph/cody-shared/src/local-context'
import { graphqlClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { CodeCompletionsClient, createClient as createCodeCompletionsClint } from './completions/client'
import { PlatformContext } from './extension.common'
import { LocalEmbeddingsConfig, LocalEmbeddingsController } from './local-context/local-embeddings'
import { logDebug, logger } from './log'

interface ExternalServices {
    intentDetector: IntentDetector
    codebaseContext: CodebaseContext
    chatClient: ChatClient
    codeCompletionsClient: CodeCompletionsClient
    guardrails: Guardrails
    localEmbeddings: LocalEmbeddingsController | undefined

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
    | 'experimentalLocalSymbols'
    | 'experimentalTracing'
> &
    LocalEmbeddingsConfig

export async function configureExternalServices(
    initialConfig: ExternalServicesConfiguration,
    rgPath: string | null,
    symf: IndexedKeywordContextFetcher | undefined,
    editor: Editor,
    platform: Pick<
        PlatformContext,
        | 'createLocalEmbeddingsController'
        | 'createFilenameContextFetcher'
        | 'createCompletionsClient'
        | 'createSentryService'
        | 'createOpenTelemetryService'
    >
): Promise<ExternalServices> {
    const sentryService = platform.createSentryService?.(initialConfig)
    const openTelemetryService = platform.createOpenTelemetryService?.(initialConfig)
    const completionsClient = platform.createCompletionsClient(initialConfig, logger)
    const codeCompletionsClient = createCodeCompletionsClint(initialConfig, logger)

    const repoId = initialConfig.codebase ? await graphqlClient.getRepoId(initialConfig.codebase) : null
    if (isError(repoId)) {
        logDebug(
            'external-services:configureExternalServices',
            `Cody could not find the '${initialConfig.codebase}' repository on your Sourcegraph instance.\n` +
                'Please check that the repository exists. You can override the repository with the "cody.codebase" setting.'
        )
    }
    const embeddingsSearch =
        repoId && !isError(repoId)
            ? new SourcegraphEmbeddingsSearchClient(graphqlClient, initialConfig.codebase || repoId, repoId)
            : null

    const localEmbeddings = platform.createLocalEmbeddingsController?.(initialConfig)

    const chatClient = new ChatClient(completionsClient)
    const codebaseContext = new CodebaseContext(
        initialConfig,
        initialConfig.codebase,
        () => initialConfig.serverEndpoint,
        embeddingsSearch,
        rgPath ? platform.createFilenameContextFetcher?.(rgPath, editor, chatClient) ?? null : null,
        null,
        null,
        symf,
        undefined
    )

    const guardrails = new SourcegraphGuardrailsClient(graphqlClient)

    return {
        intentDetector: new SourcegraphIntentDetectorClient(graphqlClient, completionsClient),
        codebaseContext,
        chatClient,
        codeCompletionsClient,
        guardrails,
        localEmbeddings,
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
