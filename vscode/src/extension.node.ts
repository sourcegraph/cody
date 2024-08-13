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
    type LocalEmbeddingsConfig,
    type LocalEmbeddingsController,
    createLocalEmbeddingsController,
} from './local-context/local-embeddings'
import { SymfRunner } from './local-context/symf'
import { AuthProvider } from './services/AuthProvider'
import { localStorage } from './services/LocalStorageProvider'
import { OpenTelemetryService } from './services/open-telemetry/OpenTelemetryService.node'
import { getExtensionDetails } from './services/telemetry-v2'
import { serializeConfigSnapshot } from './uninstall/serializeConfig'

/**
 * Activation entrypoint for the VS Code extension when running VS Code as a desktop app
 * (Node.js/Electron).
 */
export function activate(
    context: vscode.ExtensionContext,
    extensionClient?: ExtensionClient
): Promise<ExtensionApi> {
    initializeNetworkAgent(context)

    // When activated by VSCode, we are only passed the extension context.
    // Create the default client for VSCode.
    extensionClient ||= defaultVSCodeExtensionClient()

    // Local embeddings are disabled by default since we are now moving towards
    // server-side embeddings. One important side-effect of disabling local
    // embeddings is that we no longer download the cody-engine binary from
    // github.com, which has been problematic for some enterprise customers.
    // We still keep the functionality in the codebase for now in case
    // we want to revert the decision (for example, only do local embeddings
    // for Cody Pro users until we have Multitenancy).
    const isLocalEmbeddingsEnabled = vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.experimental.localEmbeddings.enabled', false)

    const isSymfEnabled = vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.experimental.symf.enabled', true)

    const isTelemetryEnabled = vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.experimental.telemetry.enabled', true)

    return activateCommon(context, {
        createLocalEmbeddingsController: isLocalEmbeddingsEnabled
            ? (config: LocalEmbeddingsConfig): Promise<LocalEmbeddingsController> =>
                  createLocalEmbeddingsController(context, config)
            : undefined,
        createCompletionsClient: (...args) => new SourcegraphNodeCompletionsClient(...args),
        createCommandsProvider: () => new CommandsProvider(),
        createSymfRunner: isSymfEnabled ? (...args) => new SymfRunner(...args) : undefined,
        createBfgRetriever: () => new BfgRetriever(context),
        createSentryService: (...args) => new NodeSentryService(...args),
        createOpenTelemetryService: isTelemetryEnabled
            ? (...args) => new OpenTelemetryService(...args)
            : undefined,
        startTokenReceiver: (...args) => startTokenReceiver(...args),
        onConfigurationChange: setCustomAgent,
        extensionClient,
    })
}

// When Cody is deactivated, we serialize the current configuration to disk,
// so that it can be sent with Telemetry when the post-uninstall script runs.
// The vscode API is not available in the post-uninstall script.
export async function deactivate(): Promise<void> {
    const config = localStorage.getConfig() ?? (await getFullConfig())
    const authStatus = AuthProvider.instance?.getAuthStatus() ?? defaultAuthStatus
    const { anonymousUserID } = await localStorage.anonymousUserID()
    serializeConfigSnapshot({
        config,
        authStatus,
        anonymousUserID,
        extensionDetails: getExtensionDetails(config),
    })
}
