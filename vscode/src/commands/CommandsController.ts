import * as vscode from 'vscode'

import { logDebug } from '../log'

import type { CodyCommandArgs } from '.'
import { CommandRunner } from './CommandRunner'
import { CommandsManager } from './manager'
import { createFileWatchers } from './custom-commands/helpers'
import { commandTools } from './utils/tools-provider'
import type { ChatSession } from '../chat/chat-view/SimpleChatPanelProvider'

/**
 * Handles commands execution with commands from CommandsManager
 * Provides additional prompt management and execution logic
 */
class CommandsController implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private provider = new CommandsManager()

    // Watchers for the cody.json files
    protected wsFileWatcher: vscode.FileSystemWatcher | null = null
    protected userFileWatcher: vscode.FileSystemWatcher | null = null
    private fileWatcherDisposables: vscode.Disposable[] = []

    constructor() {
        this.disposables.push(this.provider)
    }

    /**
     * Executes a Cody command from user input text and command args.
     * Splits text into command key and additional input before
     * starting the command execution with CommandRunner.
     */
    public async execute(text: string, args: CodyCommandArgs): Promise<ChatSession | undefined> {
        const commandSplit = text.split(' ')
        // The unique key for the command. e.g. /test
        const commandKey = commandSplit.shift() || text
        const command = this.provider.get(commandKey)
        if (!command) {
            return
        }

        // Additional instruction that will be added to end of prompt in the custom command prompt
        command.additionalInput = commandKey === text ? '' : commandSplit.join(' ')

        return await new CommandRunner(command, args).start()
    }

    /**
     * Create file watchers for cody.json files used for building Custom Commands
     */
    public init(): void {
        this.disposeWatchers()

        const { workspaceRoot, homeDir } = commandTools.getUserInfo()

        // Create file watchers in trusted workspaces only
        if (vscode.workspace.isTrusted) {
            this.wsFileWatcher = createFileWatchers(workspaceRoot)
            if (this.wsFileWatcher) {
                this.fileWatcherDisposables.push(this.wsFileWatcher)
            }
        }

        this.userFileWatcher = createFileWatchers(homeDir)
        if (this.userFileWatcher) {
            this.fileWatcherDisposables.push(this.userFileWatcher)
        }

        logDebug('CommandsController:fileWatcherInit', 'watchers created')
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposeWatchers()
        this.disposables = []
        logDebug('CommandsController:dispose', 'disposed')
    }

    private disposeWatchers(): void {
        for (const disposable of this.fileWatcherDisposables) {
            disposable.dispose()
        }
        this.fileWatcherDisposables = []
        logDebug('CommandsController:disposeWatchers', 'watchers disposed')
    }
}

/**
 * Singleton instance of the CommandsController.
 */
export const codyCommandsController = new CommandsController()

export const executeCodyCommand = codyCommandsController.execute.bind(codyCommandsController)
