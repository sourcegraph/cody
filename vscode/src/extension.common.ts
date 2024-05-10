import * as vscode from 'vscode'

import type {
    CompletionLogger,
    CompletionsClientConfig,
    Configuration,
    ConfigurationWithAccessToken,
    SourcegraphCompletionsClient,
} from '@sourcegraph/cody-shared'
import type { startTokenReceiver } from './auth/token-receiver'

import type { BfgRetriever } from './completions/context/retrievers/bfg/bfg-retriever'
import { onActivationDevelopmentHelpers } from './dev/helpers'

import './editor/displayPathEnvInfo' // import for side effects

import type { CommandsProvider } from './commands/services/provider'
import { ExtensionApi } from './extension-api'
import type { ExtensionClient } from './extension-client'
import type { ContextRankerConfig, ContextRankingController } from './local-context/context-ranking'
import type { LocalEmbeddingsConfig, LocalEmbeddingsController } from './local-context/local-embeddings'
import type { SymfRunner } from './local-context/symf'
import { start } from './main'
import type {
    OpenTelemetryService,
    OpenTelemetryServiceConfig,
} from './services/open-telemetry/OpenTelemetryService.node'
import { type SentryService, captureException } from './services/sentry/sentry'

type Constructor<T extends new (...args: any) => any> = T extends new (
    ...args: infer A
) => infer R
    ? (...args: A) => R
    : never

export interface PlatformContext {
    createCommandsProvider?: Constructor<typeof CommandsProvider>
    createLocalEmbeddingsController?: (
        config: LocalEmbeddingsConfig
    ) => Promise<LocalEmbeddingsController>
    createContextRankingController?: (config: ContextRankerConfig) => ContextRankingController
    createSymfRunner?: Constructor<typeof SymfRunner>
    createBfgRetriever?: () => BfgRetriever
    createCompletionsClient: (
        config: CompletionsClientConfig,
        logger?: CompletionLogger
    ) => SourcegraphCompletionsClient
    createSentryService?: (config: Pick<ConfigurationWithAccessToken, 'serverEndpoint'>) => SentryService
    createOpenTelemetryService?: (config: OpenTelemetryServiceConfig) => OpenTelemetryService
    startTokenReceiver?: typeof startTokenReceiver
    onConfigurationChange?: (configuration: Configuration) => void
    extensionClient: ExtensionClient
}

export async function activate(
    context: vscode.ExtensionContext,
    platformContext: PlatformContext
): Promise<ExtensionApi> {
    const api = new ExtensionApi(context.extensionMode)
    try {
        const disposable = await start(context, platformContext)
        if (!context.globalState.get('extension.hasActivatedPreviously')) {
            void context.globalState.update('extension.hasActivatedPreviously', 'true')
        }
        context.subscriptions.push(disposable)

        if (context.extensionMode === vscode.ExtensionMode.Development) {
            onActivationDevelopmentHelpers()
        }
    } catch (error) {
        captureException(error)
        console.error(error)
    }
    return api
}
