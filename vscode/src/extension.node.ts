// Network patch must be imported first
import './net/net.patch'

// Sentry should be imported as soon as possible so that errors are reported
import { NodeSentryService } from './services/sentry/sentry.node'

// Everything else
import type { LogEntry as NoxLogEntry, Noxide } from '@sourcegraph/cody-noxide'
import { logDebug, logError } from '@sourcegraph/cody-shared'
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

    const isNoxideLibEnabled = vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.experimental.noxide.enabled', true)

    return activateCommon(context, {
        initializeNetworkAgent: DelegatingAgent.initialize,
        initializeNoxideLib: isNoxideLibEnabled ? loadNoxideLib : undefined,
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

function loadNoxideLib(): Noxide | undefined {
    logDebug('Noxide Loader', 'Loading noxide library')
    let noxide: Noxide | undefined
    try {
        const nox = require('@sourcegraph/cody-noxide')
        noxide = nox.load() ?? undefined
    } catch (e) {
        logError('Noxide Loader', 'Could not load noxide library', e)
        return undefined
    }
    try {
        noxide?.log.init(noxideLogFn)
    } catch (e) {
        logError('Noxide Loader', 'Could not initialize noxide logger', e)
        return undefined
    }
    return noxide
}

function noxideLogFn(entry: NoxLogEntry): void {
    const { message, level, ...metadata } = entry
    switch (level) {
        case 'ERROR':
            logError('Noxide', entry.message, metadata)
            return
        case 'WARN':
        case 'INFO':
            logDebug('', entry.message, metadata)
            return
        case 'DEBUG':
        case 'TRACE':
            //TODO: show if verbose logging enabled
            return
    }
}
