import * as vscode from 'vscode'

import { ContextSearch } from '@sourcegraph/cody-shared/src/chat/recipes/context-search'
import { PrDescription } from '@sourcegraph/cody-shared/src/chat/recipes/generate-pr-description'
import { ReleaseNotes } from '@sourcegraph/cody-shared/src/chat/recipes/generate-release-notes'
import { GitHistory } from '@sourcegraph/cody-shared/src/chat/recipes/git-log'
import { SourcegraphNodeCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/nodeClient'

import { LocalIndexedKeywordSearch } from './chat/local-code-search'
import { CommandsController } from './commands/CommandsController'
import { BfgRetriever } from './completions/context/retrievers/bfg/bfg-retriever'
import { ExtensionApi } from './extension-api'
import { activate as activateCommon } from './extension.common'
import { VSCODE_WEB_RECIPES } from './extension.web'
import { initializeNetworkAgent, setCustomAgent } from './fetch.node'
import { FilenameContextFetcher } from './local-context/filename-context-fetcher'
import { createLocalEmbeddingsController } from './local-context/local-embeddings'
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

    return activateCommon(context, {
        getRgPath,
        createCommandsController: (...args) => new CommandsController(...args),
        createLocalEmbeddingsController: config => createLocalEmbeddingsController(context, config),
        createFilenameContextFetcher: (...args) => new FilenameContextFetcher(...args),
        createCompletionsClient: (...args) => new SourcegraphNodeCompletionsClient(...args),
        createSymfRunner: (...args) => new SymfRunner(...args),
        createBfgRetriever: () => new BfgRetriever(context),
        createSentryService: (...args) => new NodeSentryService(...args),
        createOpenTelemetryService: (...args) => new OpenTelemetryService(...args),

        // Include additional recipes that require Node packages (such as `child_process`).
        recipes: [
            ...VSCODE_WEB_RECIPES,
            new GitHistory(),
            new ReleaseNotes(),
            new PrDescription(),
            new LocalIndexedKeywordSearch(),
            new ContextSearch(),
        ],

        onConfigurationChange: setCustomAgent,
    })
}
