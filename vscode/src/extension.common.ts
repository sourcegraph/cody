import * as vscode from 'vscode'

import type { CompletionLogger, SourcegraphCompletionsClient } from '@sourcegraph/cody-shared'
import type { startTokenReceiver } from './auth/token-receiver'
import { onActivationDevelopmentHelpers } from './dev/helpers'
import './editor/displayPathEnvInfo' // import for side effects

import type { createController } from '@openctx/vscode-lib'
import type { CommandsProvider } from './commands/services/provider'
import { ExtensionApi } from './extension-api'
import type { ExtensionClient } from './extension-client'
import type { SymfRunner } from './local-context/symf'
import { start } from './main'
import type { DelegatingAgent } from './net'
import type { OpenTelemetryService } from './services/open-telemetry/OpenTelemetryService.node'
import { type SentryService, captureException } from './services/sentry/sentry'

type Constructor<T extends new (...args: any) => any> = T extends new (
    ...args: infer A
) => infer R
    ? (...args: A) => R
    : never

export interface PlatformContext {
    networkAgent?: DelegatingAgent
    createOpenCtxController?: typeof createController
    createStorage?: () => Promise<vscode.Memento>
    createCommandsProvider?: Constructor<typeof CommandsProvider>
    createSymfRunner?: Constructor<typeof SymfRunner>
    createCompletionsClient: (logger?: CompletionLogger) => SourcegraphCompletionsClient
    createSentryService?: () => SentryService
    createOpenTelemetryService?: () => OpenTelemetryService
    startTokenReceiver?: typeof startTokenReceiver
    otherInitialization?: () => vscode.Disposable
    extensionClient: ExtensionClient
}

interface ActivationContext {
    initializeNetworkAgent?: () => Promise<DelegatingAgent>
}

export async function activate(
    context: vscode.ExtensionContext,
    { initializeNetworkAgent, ...platformContext }: PlatformContext & ActivationContext
): Promise<ExtensionApi> {
    //TODO: Properly handle extension mode overrides in a single way
    const api = new ExtensionApi(context.extensionMode)
    try {
        // Important! This needs to happen before we resolve the config
        // Otherwise some eager beavers might start making network requests
        const networkAgent = await initializeNetworkAgent?.()
        if (networkAgent) {
            context.subscriptions.push(networkAgent)
            platformContext.networkAgent = networkAgent
        }
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
