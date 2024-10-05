// Sentry should be imported first
import { NodeSentryService } from './services/sentry/sentry.node'

import { subscriptionDisposable } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { startTokenReceiver } from './auth/token-receiver'
import { CommandsProvider } from './commands/services/provider'
import { SourcegraphNodeCompletionsClient } from './completions/nodeClient'
import type { ExtensionApi } from './extension-api'
import { type ExtensionClient, defaultVSCodeExtensionClient } from './extension-client'
import { activate as activateCommon } from './extension.common'
import { initializeNetworkAgent, setCustomAgent } from './fetch.node'
import { SymfRunner } from './local-context/symf'
import { OpenTelemetryService } from './services/open-telemetry/OpenTelemetryService.node'

import { proxySettings } from './configuration-proxy'

/**
 * Activation entrypoint for the VS Code extension when running VS Code as a desktop app
 * (Node.js/Electron).
 */
export function activate(
    context: vscode.ExtensionContext,
    extensionClient?: ExtensionClient
): Promise<ExtensionApi> {
    proxySettings.subscribe(setCustomAgent)
    initializeNetworkAgent(context)

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
        intializeConfigurationProxy: () => {},
        createCompletionsClient: (...args) => new SourcegraphNodeCompletionsClient(...args),
        createCommandsProvider: () => new CommandsProvider(),
        createSymfRunner: isSymfEnabled ? (...args) => new SymfRunner(...args) : undefined,
        createSentryService: (...args) => new NodeSentryService(...args),
        createOpenTelemetryService: isTelemetryEnabled
            ? (...args) => new OpenTelemetryService(...args)
            : undefined,
        startTokenReceiver: (...args) => startTokenReceiver(...args),
        otherInitialization: () => {
            return subscriptionDisposable(proxySettings.subscribe(setCustomAgent))
        },
        extensionClient,
    })
}
