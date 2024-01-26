import * as vscode from 'vscode'
import { SourcegraphNodeCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/nodeClient'

import { CommandsController } from './commands/CommandsController'
import { BfgRetriever } from './completions/context/retrievers/bfg/bfg-retriever'
import type { ExtensionApi } from './extension-api'
import { activate as activateCommon } from './extension.common'
import { initializeNetworkAgent, setCustomAgent } from './fetch.node'
import {
    createLocalEmbeddingsController,
    type LocalEmbeddingsConfig,
    type LocalEmbeddingsController,
} from './local-context/local-embeddings'
import { SymfRunner } from './local-context/symf'
import { OpenTelemetryService } from './services/open-telemetry/OpenTelemetryService.node'
import { NodeSentryService } from './services/sentry/sentry.node'

/**
 * Activation entrypoint for the VS Code extension when running VS Code as a desktop app
 * (Node.js/Electron).
 */
export function activate(context: vscode.ExtensionContext): Promise<ExtensionApi> {
    initializeNetworkAgent()

    // NOTE: local embeddings are only going to be supported in VSC for now.
    // Until we revisit this decision, we disable local embeddings for all agent
    // clients like the JetBrains plugin.
    const isLocalEmbeddingsDisabled = vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.advanced.agent.running', false)

    return activateCommon(context, {
        createLocalEmbeddingsController: isLocalEmbeddingsDisabled
            ? undefined
            : (config: LocalEmbeddingsConfig): LocalEmbeddingsController =>
                  createLocalEmbeddingsController(context, config),
        createCommandsController: (...args) => new CommandsController(...args),
        createCompletionsClient: (...args) => new SourcegraphNodeCompletionsClient(...args),
        createSymfRunner: (...args) => new SymfRunner(...args),
        createBfgRetriever: () => new BfgRetriever(context),
        createSentryService: (...args) => new NodeSentryService(...args),
        createOpenTelemetryService: (...args) => new OpenTelemetryService(...args),

        onConfigurationChange: setCustomAgent,
    })
}
