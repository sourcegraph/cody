import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { Editor } from '@sourcegraph/cody-shared/src/editor'
import { SourcegraphEmbeddingsSearchClient } from '@sourcegraph/cody-shared/src/embeddings/client'
import { Guardrails } from '@sourcegraph/cody-shared/src/guardrails'
import { SourcegraphGuardrailsClient } from '@sourcegraph/cody-shared/src/guardrails/client'
import { IntentDetector } from '@sourcegraph/cody-shared/src/intent-detector'
import { SourcegraphIntentDetectorClient } from '@sourcegraph/cody-shared/src/intent-detector/client'
import { SourcegraphCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'
import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { GraphContextFetcher } from '../../lib/shared/src/graph-context'

import { PlatformContext } from './extension.common'
import { debug, logger } from './log'
import { getRerankWithLog } from './logged-rerank'

interface ExternalServices {
    intentDetector: IntentDetector
    codebaseContext: CodebaseContext
    chatClient: ChatClient
    completionsClient: SourcegraphCompletionsClient
    guardrails: Guardrails

    /** Update configuration for all of the services in this interface. */
    onConfigurationChange: (newConfig: ExternalServicesConfiguration) => void
}

type ExternalServicesConfiguration = Pick<
    ConfigurationWithAccessToken,
    'serverEndpoint' | 'codebase' | 'useContext' | 'customHeaders' | 'accessToken' | 'debugEnable'
>

export async function configureExternalServices(
    initialConfig: ExternalServicesConfiguration,
    rgPath: string | null,
    editor: Editor,
    telemetryService: TelemetryService,
    platform: Pick<
        PlatformContext,
        'createLocalKeywordContextFetcher' | 'createFilenameContextFetcher' | 'createCompletionsClient'
    >
): Promise<ExternalServices> {
    const client = new SourcegraphGraphQLAPIClient(initialConfig)
    const completions = platform.createCompletionsClient(initialConfig, logger)

    const repoId = initialConfig.codebase ? await client.getRepoId(initialConfig.codebase) : null
    if (isError(repoId)) {
        const infoMessage =
            `Cody could not find the '${initialConfig.codebase}' repository on your Sourcegraph instance.\n` +
            'Please check that the repository exists. You can override the repository with the "cody.codebase" setting.'
        debug('embeddings', infoMessage)
        console.info(infoMessage)
    }
    const embeddingsSearch = repoId && !isError(repoId) ? new SourcegraphEmbeddingsSearchClient(client, repoId) : null

    const chatClient = new ChatClient(completions)
    const codebaseContext = new CodebaseContext(
        initialConfig,
        initialConfig.codebase,
        embeddingsSearch,
        rgPath
            ? platform.createLocalKeywordContextFetcher?.(rgPath, editor, chatClient, telemetryService) ?? null
            : null,
        rgPath ? platform.createFilenameContextFetcher?.(rgPath, editor, chatClient) ?? null : null,
        new GraphContextFetcher(client, editor),
        undefined,
        getRerankWithLog(chatClient)
    )

    const guardrails = new SourcegraphGuardrailsClient(client)

    return {
        intentDetector: new SourcegraphIntentDetectorClient(client, completions),
        codebaseContext,
        chatClient,
        completionsClient: completions,
        guardrails,
        onConfigurationChange: newConfig => {
            client.onConfigurationChange(newConfig)
            completions.onConfigurationChange(newConfig)
            codebaseContext.onConfigurationChange(newConfig)
        },
    }
}
