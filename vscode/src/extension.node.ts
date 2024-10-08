// We're synchronously requiring this to ensure the network is patched before
// anything else loads. If we're ever switching to ESM you'll need to do a
// top-level await with a IFFY / SIF e.g. `await (async () => {})`
import './net/patch-vscode'

// Sentry should be imported first
import { NodeSentryService } from './services/sentry/sentry.node'

// Everything else
import * as vscode from 'vscode'
import { startTokenReceiver } from './auth/token-receiver'
import { CommandsProvider } from './commands/services/provider'
import { SourcegraphNodeCompletionsClient } from './completions/nodeClient'
import type { ExtensionApi } from './extension-api'
import { type ExtensionClient, defaultVSCodeExtensionClient } from './extension-client'
import { activate as activateCommon } from './extension.common'
import { SymfRunner } from './local-context/symf'
import { DelegatingAgent } from './net'
import { OpenTelemetryService } from './services/open-telemetry/OpenTelemetryService.node'

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
        initializeNetworkAgent: DelegatingAgent.initialize,
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
