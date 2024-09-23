import type * as vscode from 'vscode'

import {
    ChatClient,
    type Guardrails,
    type SourcegraphCompletionsClient,
    SourcegraphGuardrailsClient,
    type StoredLastValue,
    currentAuthStatusAuthed,
    graphqlClient,
    subscriptionDisposable,
} from '@sourcegraph/cody-shared'
import { ContextAPIClient } from './chat/context/contextAPIClient'
import type { PlatformContext } from './extension.common'
import type { LocalEmbeddingsController } from './local-context/local-embeddings'
import type { SymfRunner } from './local-context/symf'
import { logger } from './log'

interface ExternalServices {
    chatClient: ChatClient
    completionsClient: SourcegraphCompletionsClient
    guardrails: Guardrails
    localEmbeddings: StoredLastValue<LocalEmbeddingsController | undefined> | undefined
    symfRunner: SymfRunner | undefined
    contextAPIClient: ContextAPIClient | undefined
    dispose(): void
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
    const disposables: (vscode.Disposable | undefined)[] = []

    const sentryService = platform.createSentryService?.()
    if (sentryService) disposables.push(sentryService)

    const openTelemetryService = platform.createOpenTelemetryService?.()
    if (openTelemetryService) disposables.push(openTelemetryService)

    const completionsClient = platform.createCompletionsClient(logger)

    const symfRunner = platform.createSymfRunner?.(context, completionsClient)
    if (symfRunner) disposables.push(symfRunner)

    const localEmbeddings = platform.createLocalEmbeddingsController?.()
    if (localEmbeddings) disposables.push(subscriptionDisposable(localEmbeddings.subscription))

    const chatClient = new ChatClient(completionsClient, () => currentAuthStatusAuthed())

    const guardrails = new SourcegraphGuardrailsClient()

    const contextAPIClient = new ContextAPIClient(graphqlClient)
    disposables.push(contextAPIClient)

    return {
        chatClient,
        completionsClient,
        guardrails,
        localEmbeddings,
        symfRunner,
        contextAPIClient,
        dispose(): void {
            for (const d of disposables) {
                d?.dispose()
            }
        },
    }
}
