import type * as vscode from 'vscode'

import { SourcegraphNodeCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/nodeClient'

import { CommandsController } from './commands/CommandsController'
import { BfgRetriever } from './completions/context/retrievers/bfg/bfg-retriever'
import { type ExtensionApi } from './extension-api'
import { activate as activateCommon } from './extension.common'
import { initializeNetworkAgent, setCustomAgent } from './fetch.node'
import { FilenameContextFetcher } from './local-context/filename-context-fetcher'
import {
    createLocalEmbeddingsController,
    type LocalEmbeddingsConfig,
    type LocalEmbeddingsController,
} from './local-context/local-embeddings'
import { SymfRunner } from './local-context/symf'
import { getRgPath } from './rg'
import { OpenTelemetryService } from './services/open-telemetry/OpenTelemetryService.node'
import { NodeSentryService } from './services/sentry/sentry.node'

/**
 * Activation entrypoint for the VS Code extension when running VS Code as a desktop app
 * (Node.js/Electron).
 */
export function activate(context: vscode.ExtensionContext): Promise<ExtensionApi> {
    initializeNetworkAgent()

    // NOTE: local embeddings were causing flaky test failures in CI due to
    // failures around downloading the cody-engine binary. The root problem
    // seems caused by the fact that we don't handle the error case when failing
    // to download the binary, which caused the entire agent Node process to
    // exit and fail the tests. For now, we have disabled local embeddings like
    // this to unblock further progress. Tracked here
    // https://github.com/sourcegraph/jetbrains/issues/270
    const isLocalEmbeddingsDisabled = process.env.CODY_LOCAL_EMBEDDINGS_DISABLED === 'true'

    return activateCommon(context, {
        getRgPath,
        createLocalEmbeddingsController: isLocalEmbeddingsDisabled
            ? undefined
            : (config: LocalEmbeddingsConfig): LocalEmbeddingsController =>
                  createLocalEmbeddingsController(context, config),
        createCommandsController: (...args) => new CommandsController(...args),
        createFilenameContextFetcher: (...args) => new FilenameContextFetcher(...args),
        createCompletionsClient: (...args) => new SourcegraphNodeCompletionsClient(...args),
        createSymfRunner: (...args) => new SymfRunner(...args),
        createBfgRetriever: () => new BfgRetriever(context),
        createSentryService: (...args) => new NodeSentryService(...args),
        createOpenTelemetryService: (...args) => new OpenTelemetryService(...args),

        onConfigurationChange: setCustomAgent,
    })
}
