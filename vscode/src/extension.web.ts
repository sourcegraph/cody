import type * as vscode from 'vscode'

import { SourcegraphBrowserCompletionsClient } from '@sourcegraph/cody-shared'

import type { ExtensionApi } from './extension-api'
import { activate as activateCommon } from './extension.common'
import { WebSentryService } from './services/sentry/sentry.web'

/**
 * Activation entrypoint for the VS Code extension when running in VS Code Web (https://vscode.dev,
 * https://github.dev, etc.).
 */
export function activate(context: vscode.ExtensionContext): Promise<ExtensionApi> {
    return activateCommon(context, {
        createCompletionsClient: (...args) => new SourcegraphBrowserCompletionsClient(...args),
        createSentryService: (...args) => new WebSentryService(...args),
    })
}
