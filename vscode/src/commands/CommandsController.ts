import * as vscode from 'vscode'

import type { CodyCommand, VsCodeCommandsController } from '@sourcegraph/cody-shared'

import type { VSCodeEditor } from '../editor/vscode-editor'
import { logDebug } from '../log'
import { localStorage } from '../services/LocalStorageProvider'

import type { CodyCommandArgs } from '.'
import { CommandRunner } from './CommandRunner'
import { CommandsProvider } from './provider'
import { createFileWatchers } from './custom-commands/helpers'
import { commandTools } from './utils/tools-provider'
import { showCommandMenu } from './menus'

/**
 * Manage commands built with prompts from CustomCommandsStore and CommandsProvider
 * Provides additional prompt management and execution logic
 */
export class CommandsController implements VsCodeCommandsController, vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private provider = new CommandsProvider()

    private lastUsedCommands = new Set<string>()

    // Watchers for cody.json files
    private webViewMessenger: (() => Promise<void>) | null = null
    protected wsFileWatcher: vscode.FileSystemWatcher | null = null
    protected userFileWatcher: vscode.FileSystemWatcher | null = null
    private fileWatcherDisposables: vscode.Disposable[] = []

    constructor(private readonly editor: VSCodeEditor) {
        this.disposables.push(this.provider)

        this.lastUsedCommands = new Set(localStorage.getLastUsedCommands())
        this.fileWatcherInit()
    }

    /**
     * Executes a Cody command from user input text and command args.
     * Splits text into command key and additional input before
     * starting the command execution with CommandRunner.
     */
    public async execute(text: string, args: CodyCommandArgs): Promise<void> {
        const commandSplit = text.split(' ')
        // The unique key for the command. e.g. /test
        const commandKey = commandSplit.shift() || text
        // Additional instruction that will be added to end of prompt in the custom command prompt
        const additionalInput = commandKey === text ? '' : commandSplit.join(' ')

        const command = this.provider.get(commandKey)
        if (command) {
            this.lastUsedCommands.add(commandKey)
            command.additionalInput = additionalInput

            await new CommandRunner(this.editor, command, args).start()
        }
    }

    public async getCommands(keepSperator = false): Promise<[string, CodyCommand][]> {
        return this.provider.getGroupedCommands(keepSperator)
    }

    public async menu(type: 'custom' | 'config' | 'default'): Promise<void> {
        const customCommands = await this.provider.getCustomCommands()
        const commandArray = [...customCommands].map(command => command[1])
        await showCommandMenu(type, commandArray)
    }

    /**
     * Set the messenger function to be used to send messages to the webview
     */
    public setMessenger(messenger: () => Promise<void>): void {
        if (this.webViewMessenger) {
            return
        }

        this.webViewMessenger = messenger
    }

    /**
     * Create file watchers for cody.json files used for building Custom Commands
     */
    private fileWatcherInit(): void {
        for (const disposable of this.fileWatcherDisposables) {
            disposable.dispose()
        }
        this.fileWatcherDisposables = []
        const { workspaceRoot, homeDir } = commandTools.getUserInfo()

        // Create file watchers in trusted workspaces only
        if (vscode.workspace.isTrusted) {
            this.wsFileWatcher = createFileWatchers(workspaceRoot)
            if (this.wsFileWatcher) {
                this.fileWatcherDisposables.push(
                    this.wsFileWatcher,
                    this.wsFileWatcher.onDidChange(() => this.webViewMessenger?.()),
                    this.wsFileWatcher.onDidDelete(() => this.webViewMessenger?.())
                )
            }
        }

        this.userFileWatcher = createFileWatchers(homeDir)
        if (this.userFileWatcher) {
            this.fileWatcherDisposables.push(
                this.userFileWatcher,
                this.userFileWatcher.onDidChange(() => this.webViewMessenger?.()),
                this.userFileWatcher.onDidDelete(() => this.webViewMessenger?.())
            )
        }

        logDebug('CommandsController:fileWatcherInit', 'watchers created')
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        for (const disposable of this.fileWatcherDisposables) {
            disposable.dispose()
        }
        this.fileWatcherDisposables = []
        this.disposables = []
        logDebug('CommandsController:dispose', 'disposed')
    }
}
