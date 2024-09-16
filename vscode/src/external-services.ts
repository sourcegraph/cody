import type * as vscode from 'vscode'

import {
    ChatClient,
    type Guardrails,
    type SourcegraphCompletionsClient,
    SourcegraphGuardrailsClient,
    type StoredLastValue,
    currentAuthStatusAuthed,
    firstValueFrom,
    graphqlClient,
    isError,
    resolvedConfigWithAccessToken,
} from '@sourcegraph/cody-shared'

import { ContextAPIClient } from './chat/context/contextAPIClient'
import type { PlatformContext } from './extension.common'
import type { LocalEmbeddingsController } from './local-context/local-embeddings'
import type { SymfRunner } from './local-context/symf'
import { logDebug, logger } from './log'

interface ExternalServices {
    chatClient: ChatClient
    completionsClient: SourcegraphCompletionsClient
    guardrails: Guardrails
    localEmbeddings: StoredLastValue<LocalEmbeddingsController | undefined> | undefined
    symfRunner: SymfRunner | undefined
    contextAPIClient: ContextAPIClient | undefined
}

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
    const completionsClient = platform.createCompletionsClient(logger)

    const symfRunner = platform.createSymfRunner?.(context, completionsClient)

    if (initialConfig.codebase && isError(await graphqlClient.getRepoId(initialConfig.codebase))) {
        logDebug(
            'external-services:configureExternalServices',
            `Cody could not find the '${initialConfig.codebase}' repository on your Sourcegraph instance.\nPlease check that the repository exists. You can override the repository with the "cody.codebase" setting.`
        )
    }

    const localEmbeddings = platform.createLocalEmbeddingsController?.()

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
    }
}
