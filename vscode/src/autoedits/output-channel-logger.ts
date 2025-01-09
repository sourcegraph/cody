import * as vscode from 'vscode'
import { getConfiguration } from '../configuration'
import { Logger } from '../output-channel-logger'

export class AutoEditsOutputChannelLogger extends Logger {
    private readonly logger: Logger

    constructor(feature: string) {
        super(feature)
        this.logger = new Logger(feature)
    }

    logDebugIfVerbose(filterLabel: string, text: string, ...args: unknown[]): void {
        const workspaceConfig = vscode.workspace.getConfiguration()
        const { debugVerbose } = getConfiguration(workspaceConfig)

        if (debugVerbose) {
            this.logger.logDebug(filterLabel, text, ...args)
        }
    }
}

export const autoeditsOutputChannelLogger = new AutoEditsOutputChannelLogger('AutoEdits')
