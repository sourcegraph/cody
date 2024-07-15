import type * as vscode from 'vscode'

import { SourcegraphBrowserCompletionsClient } from '@sourcegraph/cody-shared'

import type { ExtensionApi } from './extension-api'
import { type ExtensionClient, defaultVSCodeExtensionClient } from './extension-client'
import { type PlatformContext, activate as activateCommon } from './extension.common'
import { WebSentryService } from './services/sentry/sentry.web'

/**
 * Activation entrypoint for the VS Code extension when running in VS Code Web (https://vscode.dev,
 * https://github.dev, etc.).
 */
export function activate(
    context: vscode.ExtensionContext,
    extensionClient?: ExtensionClient
): Promise<ExtensionApi> {
    return activateCommon(context, {
        createCompletionsClient: (...args) => new SourcegraphBrowserCompletionsClient(...args),
        createSentryService: (...args) => new WebSentryService(...args),
        extensionClient: extensionClient ?? defaultVSCodeExtensionClient(),
    })
}

export function createActivation(platformContext: Partial<PlatformContext>): typeof activate {
    return (context: vscode.ExtensionContext, extensionClient?: ExtensionClient) => {
        return activateCommon(context, {
            createCompletionsClient: (...args) => new SourcegraphBrowserCompletionsClient(...args),
            createSentryService: (...args) => new WebSentryService(...args),
            extensionClient: extensionClient ?? defaultVSCodeExtensionClient(),
            ...platformContext,
        })
    }
}
