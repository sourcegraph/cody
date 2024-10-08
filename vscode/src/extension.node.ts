// Sentry should be imported first
import { NodeSentryService } from './services/sentry/sentry.node'

// Network patching needs to happend ASAP
import { patchNetworkStack } from './net.node'
patchNetworkStack()

// Everything else
import { currentAuthStatus, currentResolvedConfig } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { startTokenReceiver } from './auth/token-receiver'
import { CommandsProvider } from './commands/services/provider'
import { SourcegraphNodeCompletionsClient } from './completions/nodeClient'
import type { ExtensionApi } from './extension-api'
import { type ExtensionClient, defaultVSCodeExtensionClient } from './extension-client'
import { activate as activateCommon } from './extension.common'
import { SymfRunner } from './local-context/symf'
import { DelegatingProxyAgent } from './net.node'
import { localStorage } from './services/LocalStorageProvider'
import { OpenTelemetryService } from './services/open-telemetry/OpenTelemetryService.node'
import { serializeConfigSnapshot } from './uninstall/serializeConfig'

/**
 * Activation entrypoint for the VS Code extension when running VS Code as a desktop app
 * (Node.js/Electron).
 */
export function activate(
    context: vscode.ExtensionContext,
    extensionClient?: ExtensionClient
): Promise<ExtensionApi> {
    // When activated by VSCode, we are only passed the extension context.
    // Create the default client for VSCode.
    extensionClient ||= defaultVSCodeExtensionClient()

    const isSymfEnabled = vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.experimental.symf.enabled', true)

    const isTelemetryEnabled = vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.experimental.telemetry.enabled', true)

    return activateCommon(context, {
        initializeNetworkAgent: DelegatingProxyAgent.initialize,
        createCompletionsClient: (...args) => new SourcegraphNodeCompletionsClient(...args),
        createCommandsProvider: () => new CommandsProvider(),
        createSymfRunner: isSymfEnabled ? (...args) => new SymfRunner(...args) : undefined,
        createSentryService: (...args) => new NodeSentryService(...args),
        createOpenTelemetryService: isTelemetryEnabled
            ? (...args) => new OpenTelemetryService(...args)
            : undefined,
        startTokenReceiver: (...args) => startTokenReceiver(...args),
        extensionClient,
    })
}

// When Cody is deactivated, we serialize the current configuration to disk,
// so that it can be sent with Telemetry when the post-uninstall script runs.
// The vscode API is not available in the post-uninstall script.
export async function deactivate(): Promise<void> {
    const config = localStorage.getConfig() ?? (await currentResolvedConfig())
    const authStatus = currentAuthStatus()
    serializeConfigSnapshot({
        config,
        authStatus,
    })
}
