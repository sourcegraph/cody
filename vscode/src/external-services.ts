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
import { logDebug, logger } from './log'
import { getRerankWithLog } from './logged-rerank'

interface ExternalServices {
    intentDetector: IntentDetector
    codebaseContext: CodebaseContext
    chatClient: ChatClient
    codeCompletionsClient: CodeCompletionsClient
    guardrails: Guardrails

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
>

export async function configureExternalServices(
    initialConfig: ExternalServicesConfiguration,
    rgPath: string | null,
    symf: IndexedKeywordContextFetcher | undefined,
    editor: Editor,
    platform: Pick<
        PlatformContext,
        | 'createLocalKeywordContextFetcher'
        | 'createFilenameContextFetcher'
        | 'createCompletionsClient'
        | 'createSentryService'
    >
): Promise<ExternalServices> {
    const sentryService = platform.createSentryService?.(initialConfig)
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
        repoId && !isError(repoId) ? new SourcegraphEmbeddingsSearchClient(graphqlClient, repoId) : null

    const chatClient = new ChatClient(completionsClient)
    const codebaseContext = new CodebaseContext(
        initialConfig,
        initialConfig.codebase,
        embeddingsSearch,
        rgPath ? platform.createLocalKeywordContextFetcher?.(rgPath, editor, chatClient) ?? null : null,
        rgPath ? platform.createFilenameContextFetcher?.(rgPath, editor, chatClient) ?? null : null,
        null,
        symf,
        undefined,
        getRerankWithLog(chatClient)
    )

    const guardrails = new SourcegraphGuardrailsClient(graphqlClient)

    return {
        intentDetector: new SourcegraphIntentDetectorClient(graphqlClient, completionsClient),
        codebaseContext,
        chatClient,
        codeCompletionsClient,
        guardrails,
        onConfigurationChange: newConfig => {
            sentryService?.onConfigurationChange(newConfig)
            completionsClient.onConfigurationChange(newConfig)
            codeCompletionsClient.onConfigurationChange(newConfig)
            codebaseContext.onConfigurationChange(newConfig)
        },
    }
}
