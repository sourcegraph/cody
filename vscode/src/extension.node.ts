// Sentry should be imported first
import { NodeSentryService } from './services/sentry/sentry.node'

import * as vscode from 'vscode'

import { defaultAuthStatus } from '@sourcegraph/cody-shared'
import { startTokenReceiver } from './auth/token-receiver'
import { CommandsProvider } from './commands/services/provider'
import { BfgRetriever } from './completions/context/retrievers/bfg/bfg-retriever'
import { SourcegraphNodeCompletionsClient } from './completions/nodeClient'
import { getFullConfig } from './configuration'
import type { ExtensionApi } from './extension-api'
import { type ExtensionClient, defaultVSCodeExtensionClient } from './extension-client'
import { activate as activateCommon } from './extension.common'
import { initializeNetworkAgent, setCustomAgent } from './fetch.node'
import {
    type ContextRankerConfig,
    createContextRankingController,
} from './local-context/context-ranking'
import {
    type LocalEmbeddingsConfig,
    type LocalEmbeddingsController,
    createLocalEmbeddingsController,
} from './local-context/local-embeddings'
import { SymfRunner } from './local-context/symf'
import { authProvider } from './services/AuthProvider'
import { localStorage } from './services/LocalStorageProvider'
import { OpenTelemetryService } from './services/open-telemetry/OpenTelemetryService.node'
import { getExtensionDetails } from './services/telemetry'
import { serializeConfigSnapshot } from './uninstall/serializeConfig'

/**
 * Activation entrypoint for the VS Code extension when running VS Code as a desktop app
 * (Node.js/Electron).
 */
export function activate(
    context: vscode.ExtensionContext,
    extensionClient?: ExtensionClient
): Promise<ExtensionApi> {
    initializeNetworkAgent()

    // When activated by VSCode, we are only passed the extension context.
    // Create the default client for VSCode.
    extensionClient ||= defaultVSCodeExtensionClient()

    // NOTE: local embeddings are only going to be supported in VSC for now.
    // Until we revisit this decision, we disable local embeddings for all agent
    // clients like the JetBrains plugin.
    const isLocalEmbeddingsDisabled = vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.advanced.agent.running', false)

    return activateCommon(context, {
        createLocalEmbeddingsController: isLocalEmbeddingsDisabled
            ? undefined
            : (config: LocalEmbeddingsConfig): Promise<LocalEmbeddingsController> =>
                  createLocalEmbeddingsController(context, config),
        createContextRankingController: (config: ContextRankerConfig) =>
            createContextRankingController(context, config),
        createCompletionsClient: (...args) => new SourcegraphNodeCompletionsClient(...args),
        createCommandsProvider: () => new CommandsProvider(),
        createSymfRunner: (...args) => new SymfRunner(...args),
        createBfgRetriever: () => new BfgRetriever(context),
        createSentryService: (...args) => new NodeSentryService(...args),
        createOpenTelemetryService: (...args) => new OpenTelemetryService(...args),
        startTokenReceiver: (...args) => startTokenReceiver(...args),

        onConfigurationChange: setCustomAgent,
        extensionClient,
    })
}

// When cody is deactivated, we serialize the current configuration to disk,
// so that it can be restored when the post-uninstall script is run, and the
// vscode API is not available
export async function deactivate(): Promise<void> {
    const config = localStorage.getConfig() ?? (await getFullConfig())
    const authStatus = authProvider?.getAuthStatus() ?? defaultAuthStatus
    const { anonymousUserID } = await localStorage.anonymousUserID()
    serializeConfigSnapshot({
        config,
        authStatus,
        anonymousUserID,
        extensionDetails: getExtensionDetails(config),
    })
}
