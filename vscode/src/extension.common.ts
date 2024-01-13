import * as vscode from 'vscode'

import { type Recipe } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { type Configuration, type ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import type { SourcegraphBrowserCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/browserClient'
import type { SourcegraphNodeCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/nodeClient'

import { type CommandsController } from './commands/CommandsController'
import { type BfgRetriever } from './completions/context/retrievers/bfg/bfg-retriever'
import { onActivationDevelopmentHelpers } from './dev/helpers'

import './editor/displayPathEnvInfo' // import for side effects

import { ExtensionApi } from './extension-api'
import type { FilenameContextFetcher } from './local-context/filename-context-fetcher'
import type { LocalEmbeddingsConfig, LocalEmbeddingsController } from './local-context/local-embeddings'
import type { SymfRunner } from './local-context/symf'
import { start } from './main'
import type { getRgPath } from './rg'
import { type OpenTelemetryService } from './services/open-telemetry/OpenTelemetryService.node'
import { captureException, type SentryService } from './services/sentry/sentry'

type Constructor<T extends new (...args: any) => any> = T extends new (...args: infer A) => infer R
    ? (...args: A) => R
    : never

export interface PlatformContext {
    getRgPath?: typeof getRgPath
    createCommandsController?: Constructor<typeof CommandsController>
    createLocalEmbeddingsController?: (config: LocalEmbeddingsConfig) => LocalEmbeddingsController
    createSymfRunner?: Constructor<typeof SymfRunner>
    createBfgRetriever?: () => BfgRetriever
    createFilenameContextFetcher?: Constructor<typeof FilenameContextFetcher>
    createCompletionsClient:
        | Constructor<typeof SourcegraphBrowserCompletionsClient>
        | Constructor<typeof SourcegraphNodeCompletionsClient>
    createSentryService?: (config: Pick<ConfigurationWithAccessToken, 'serverEndpoint'>) => SentryService
    createOpenTelemetryService?: (
        config: Pick<ConfigurationWithAccessToken, 'serverEndpoint' | 'experimentalTracing'>
    ) => OpenTelemetryService
    recipes: Recipe[]
    onConfigurationChange?: (configuration: Configuration) => void
}

export async function activate(
    context: vscode.ExtensionContext,
    platformContext: PlatformContext
): Promise<ExtensionApi> {
    const api = new ExtensionApi()

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
