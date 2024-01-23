import * as vscode from 'vscode'

import type { CodyCommand, VsCodeCommandsController } from '@sourcegraph/cody-shared'

import { getFullConfig } from '../configuration'
import { getEditor } from '../editor/active-editor'
import type { VSCodeEditor } from '../editor/vscode-editor'
import { logDebug } from '../log'
import { localStorage } from '../services/LocalStorageProvider'

import type { CodyCommandArgs } from '.'
import { CommandRunner } from './CommandRunner'
import { CustomPromptsStore } from './CustomPromptsStore'
import { PromptsProvider } from './PromptsProvider'
import { constructFileUri, createFileWatchers } from './utils/helpers'
import { ToolsProvider } from './utils/ToolsProvider'
import { showCommandMenu } from './CommandMenu'

/**
 * Manage commands built with prompts from CustomPromptsStore and PromptsProvider
 * Provides additional prompt management and execution logic
 */
export class CommandsController implements VsCodeCommandsController, vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    private tools: ToolsProvider
    private custom: CustomPromptsStore
    public default = new PromptsProvider()

    private lastUsedCommands = new Set<string>()

    private webViewMessenger: (() => Promise<void>) | null = null
    public wsFileWatcher: vscode.FileSystemWatcher | null = null
    public userFileWatcher: vscode.FileSystemWatcher | null = null

    public enableExperimentalCommands = false

    constructor(private readonly editor: VSCodeEditor) {
        this.tools = new ToolsProvider()
        const user = this.tools.getUserInfo()

        this.custom = new CustomPromptsStore(user?.workspaceRoot, user.homeDir)
        this.disposables.push(this.custom)

        this.lastUsedCommands = new Set(localStorage.getLastUsedCommands())
        this.fileWatcherInit()

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(async event => {
                if (event.affectsConfiguration('cody')) {
                    const config = await getFullConfig()
                    this.setEnableExperimentalCommands(config.internalUnstable)
                    await this.refresh()
                }
            })
        )
    }

    public setEnableExperimentalCommands(enable: boolean): void {
        this.enableExperimentalCommands = enable
    }

    public async execute(text: string, args: CodyCommandArgs): Promise<void> {
        const editor = getEditor()
        if (!editor.active || editor.ignored) {
            const message = editor.ignored
                ? 'Current file is ignored by a .cody/ignore file. Please remove it from the list and try again.'
                : 'No editor is active. Please open a file and try again.'
            void vscode.window.showErrorMessage(message)
            return
        }

        const commandSplit = text.split(' ')
        // The unique key for the command. e.g. /test
        const commandKey = commandSplit.shift() || text
        // Additional instruction that will be added to end of prompt in the custom command prompt
        const additionalInput = commandKey === text ? '' : commandSplit.join(' ')

        const command = this.default.get(commandKey)
        if (!command) {
            return
        }
        this.lastUsedCommands.add(commandKey)

        command.additionalInput = additionalInput

        await new CommandRunner(this.editor, command, args).start()
    }

    /**
     * Get the list of command names and prompts to send to the webview for display.
     * @returns An array of tuples containing the command name and prompt object.
     */
    public async getAllCommands(keepSperator = false): Promise<[string, CodyCommand][]> {
        await this.refresh()
        return this.default.getGroupedCommands(keepSperator)
    }

    /**
     * Menu Controller
     */
    public async menu(type: 'custom' | 'config' | 'default'): Promise<void> {
        const { commands } = await this.custom.refresh()
        const commandArray = [...commands].map(command => command[1])
        await showCommandMenu(type, commandArray)
    }

    /**
     * Get the latest content from the custom store and send it to default store
     * to be used in the menu
     */
    public async refresh(): Promise<void> {
        const { commands } = await this.custom.refresh()
        this.default.groupCommands(commands, this.enableExperimentalCommands)
    }

    /**
     * Open workspace file with filePath in editor
     */
    public async open(filePath: string): Promise<void> {
        if (filePath === 'user' || filePath === 'workspace') {
            const uri = this.custom.jsonFileUris[filePath]
            const doesExist = await this.tools.doesUriExist(uri)
            // create file if it doesn't exist
            return doesExist ? this.tools.openFile(uri) : this.open(filePath)
        }
        const fileUri = constructFileUri(filePath, this.tools.getUserInfo()?.workspaceRoot)

        return vscode.commands.executeCommand('vscode.open', fileUri)
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

    private fileWatcherDisposables: vscode.Disposable[] = []

    /**
     * Create file watchers for cody.json files used for building Custom Commands
     */
    private fileWatcherInit(): void {
        for (const disposable of this.fileWatcherDisposables) {
            disposable.dispose()
        }
        this.fileWatcherDisposables = []

        const user = this.tools.getUserInfo()

        this.wsFileWatcher = createFileWatchers(user?.workspaceRoot)
        if (this.wsFileWatcher) {
            this.fileWatcherDisposables.push(
                this.wsFileWatcher,
                this.wsFileWatcher.onDidChange(() => this.webViewMessenger?.()),
                this.wsFileWatcher.onDidDelete(() => this.webViewMessenger?.())
            )
        }

        this.userFileWatcher = createFileWatchers(user?.homeDir)
        if (this.userFileWatcher) {
            this.fileWatcherDisposables.push(
                this.userFileWatcher,
                this.userFileWatcher.onDidChange(() => this.webViewMessenger?.()),
                this.userFileWatcher.onDidDelete(() => this.webViewMessenger?.())
            )
        }

        logDebug('CommandsController:fileWatcherInit', 'watchers created')
    }

    /**
     * Dispose and reset the controller and builder
     */
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
