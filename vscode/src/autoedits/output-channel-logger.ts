import * as vscode from 'vscode'

import { getConfiguration } from '../configuration'
import { Logger } from '../output-channel-logger'

export class AutoEditsOutputChannelLogger extends Logger {
    logDebugIfVerbose(filterLabel: string, text: string, ...args: unknown[]): void {
        const workspaceConfig = vscode.workspace.getConfiguration()
        const { debugVerbose } = getConfiguration(workspaceConfig)

        if (debugVerbose) {
            this.logDebug(filterLabel, text, ...args)
        }
    }
}

export const autoeditsOutputChannelLogger = new AutoEditsOutputChannelLogger('AutoEdits')
