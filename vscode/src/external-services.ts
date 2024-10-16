import type * as vscode from 'vscode'

import {
    ChatClient,
    type Guardrails,
    type SourcegraphCompletionsClient,
    SourcegraphGuardrailsClient,
    graphqlClient,
} from '@sourcegraph/cody-shared'

import { ChatIntentAPIClient } from './chat/context/chatIntentAPIClient'
import { autocompleteLifecycleOutputChannelLogger } from './completions/output-channel-logger'
import type { PlatformContext } from './extension.common'
import type { SymfRunner } from './local-context/symf'

interface ExternalServices {
    chatClient: ChatClient
    completionsClient: SourcegraphCompletionsClient
    guardrails: Guardrails
    symfRunner: SymfRunner | undefined
    chatIntentAPIClient: ChatIntentAPIClient | undefined
    dispose(): void
}

export async function configureExternalServices(
    context: vscode.ExtensionContext,
    platform: Pick<
        PlatformContext,
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

    const completionsClient = platform.createCompletionsClient(autocompleteLifecycleOutputChannelLogger)

    const symfRunner = platform.createSymfRunner?.(context, completionsClient)
    if (symfRunner) disposables.push(symfRunner)

    const chatClient = new ChatClient(completionsClient)

    const guardrails = new SourcegraphGuardrailsClient()

    const chatIntentAPIClient = new ChatIntentAPIClient(graphqlClient)
    disposables.push(chatIntentAPIClient)

    return {
        chatClient,
        completionsClient,
        guardrails,
        symfRunner,
        chatIntentAPIClient,
        dispose(): void {
            for (const d of disposables) {
                d?.dispose()
            }
        },
    }
}
