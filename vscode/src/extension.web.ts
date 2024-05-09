// Sentry should be imported first
import { WebSentryService } from './services/sentry/sentry.web'

// Internal logging library second
import { ConsoleLogMessageSink, SaveLogItemsSink, logger } from '@sourcegraph/cody-shared/src/logtrace'
logger.register('vscode-web', [new SaveLogItemsSink(1000), new ConsoleLogMessageSink()])

import { SourcegraphBrowserCompletionsClient } from '@sourcegraph/cody-shared'
// Other dependencies
import type * as vscode from 'vscode'
import { LogTraceWebSinksService } from './services/logtrace/sinks.web'

import type { ExtensionApi } from './extension-api'
import { defaultVSCodeExtensionClient } from './extension-client'
import { activate as activateCommon } from './extension.common'

/**
 * Activation entrypoint for the VS Code extension when running in VS Code Web (https://vscode.dev,
 * https://github.dev, etc.).
 */
export function activate(context: vscode.ExtensionContext): Promise<ExtensionApi> {
    return activateCommon(context, {
        createCompletionsClient: (...args) => new SourcegraphBrowserCompletionsClient(...args),
        createSentryService: (...args) => new WebSentryService(...args),
        createLogTraceSinksService: (...args) => new LogTraceWebSinksService(...args),
        extensionClient: defaultVSCodeExtensionClient(),
    })
}
