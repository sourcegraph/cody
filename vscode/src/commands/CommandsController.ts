import * as vscode from 'vscode'

import { type CodyCommand, type CustomCommandType, type VsCodeCommandsController } from '@sourcegraph/cody-shared'

import { getFullConfig } from '../configuration'
import { executeEdit } from '../edit/execute'
import { getEditor } from '../editor/active-editor'
import { type VSCodeEditor } from '../editor/vscode-editor'
import { logDebug, logError } from '../log'
import { localStorage } from '../services/LocalStorageProvider'

import { type CodyCommandArgs } from '.'
import { CommandRunner } from './CommandRunner'
import { CustomPromptsStore } from './CustomPromptsStore'
import { showCommandConfigMenu, showCommandMenu, showCustomCommandMenu, showNewCustomCommandMenu } from './menus'
import { PromptsProvider } from './PromptsProvider'
import { constructFileUri, createFileWatchers, createQuickPickItem, openCustomCommandDocsLink } from './utils/helpers'
import { menu_options, menu_separators, showAskQuestionQuickPick, showRemoveConfirmationInput } from './utils/menu'
import { ToolsProvider } from './utils/ToolsProvider'

/**
 * Manage commands built with prompts from CustomPromptsStore and PromptsProvider
 * Provides additional prompt management and execution logic
 */
export class CommandsController implements VsCodeCommandsController, vscode.Disposable {
    private isEnabled = true

    private disposables: vscode.Disposable[] = []

    private tools: ToolsProvider
    private custom: CustomPromptsStore
    // Provide the default Cody Commands
    public default
    // Provide the custom commands from user file system or codebase
    private userCustomCommandsMap = new Map<string, CodyCommand>()

    private lastUsedCommands = new Set<string>()

    private webViewMessenger: (() => Promise<void>) | null = null
    public wsFileWatcher: vscode.FileSystemWatcher | null = null
    public userFileWatcher: vscode.FileSystemWatcher | null = null

    public enableExperimentalCommands = false

    constructor(private readonly editor: VSCodeEditor) {
        this.default = new PromptsProvider()
        this.tools = new ToolsProvider()
        const user = this.tools.getUserInfo()

        this.custom = new CustomPromptsStore(this.isEnabled, user?.workspaceRoot, user.homeDir)
        this.disposables.push(this.custom)

        this.lastUsedCommands = new Set(localStorage.getLastUsedCommands())
        this.custom.activate()
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

    public async startCommand(text: string, args: CodyCommandArgs): Promise<CodyCommand | null> {
        const editor = getEditor()
        if (!editor.active || editor.ignored) {
            const message = editor.ignored
                ? 'Current file is ignored by a .cody/ignore file. Please remove it from the list and try again.'
                : 'No editor is active. Please open a file and try again.'
            void vscode.window.showErrorMessage(message)
            return null
        }

        const commandSplit = text.split(' ')
        // The unique key for the command. e.g. /test
        const commandKey = commandSplit.shift() || text
        // Additional instruction that will be added to end of prompt in the custom command prompt
        const additionalInput = commandKey === text ? '' : commandSplit.join(' ')

        const command = this.default.get(commandKey)
        if (!command) {
            return null
        }
        command.additionalInput = additionalInput

        // Save command to command history
        this.lastUsedCommands.add(commandKey)

        // Start the command runner
        const runner = new CommandRunner(this.editor, command, args)
        if (!runner) {
            return null
        }

        // TODO bee runs tools in runner instead
        // Run shell command if any
        const shellCommand = command.context?.command
        if (shellCommand) {
            await runner.runShell(this.tools.exeCommand(shellCommand))
        }

        return runner.command
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
        await this.refresh()
        switch (type) {
            case 'custom':
                await this.customCommandMenu()
                break
            case 'config':
                await this.configMenu()
                break
            case 'default':
                await this.mainCommandMenu()
                break
            default:
                break
        }
    }

    /**
     * Get the latest content from the custom store and send it to default store
     * to be used in the menu
     */
    public async refresh(): Promise<void> {
        await this.saveLastUsedCommands()
        const { commands } = await this.custom.refresh()
        this.userCustomCommandsMap = commands
        this.default.groupCommands(commands, this.enableExperimentalCommands)
    }

    /**
     * Main Menu: Cody Commands
     */
    public async mainCommandMenu(): Promise<void> {
        try {
            const commands = this.default.getGroupedCommands(true)?.map(([name, command]) => {
                if (command.prompt === 'separator') {
                    return menu_separators.customCommands
                }
                let label: string | undefined
                let description: string | undefined
                let slashCommand: string | undefined

                if (command.slashCommand) {
                    label = command.slashCommand
                    description = command.description || name
                    slashCommand = command.slashCommand
                } else {
                    label = command.description || name
                    description = command.type === 'default' ? '' : command.type
                }

                return { label, description, slashCommand }
            })

            // Show the list of prompts to the user using a quick pick menu
            const { selectedItem: selectedPrompt, input: userPrompt } = await showCommandMenu([
                menu_separators.commands,
                ...commands.sort((a, b) => a.label.localeCompare(b.label)),
                menu_separators.settings,
                menu_options.config,
            ])
            if (!selectedPrompt) {
                return
            }

            const selectedCommandID =
                'slashCommand' in selectedPrompt ? selectedPrompt.slashCommand : selectedPrompt.label
            switch (true) {
                case !selectedCommandID:
                    break
                case selectedCommandID === menu_options.config.label:
                    return await vscode.commands.executeCommand('cody.settings.commands')
                case selectedCommandID === menu_options.chat.slashCommand: {
                    let input = userPrompt.trim()
                    if (input) {
                        return await vscode.commands.executeCommand('cody.action.chat', input, { source: 'command' })
                    }
                    input = await showAskQuestionQuickPick()
                    await vscode.commands.executeCommand('cody.chat.panel.new')
                    return await vscode.commands.executeCommand('cody.action.chat', input, { source: 'command' })
                }
                case selectedCommandID === menu_options.fix.slashCommand: {
                    const source = 'menu'
                    return await executeEdit({ instruction: userPrompt.trim() }, source)
                }
            }

            const inputText = [selectedCommandID, userPrompt].join(' ')
            await vscode.commands.executeCommand('cody.action.commands.exec', inputText)
        } catch (error) {
            logError('CommandsController:commandQuickPicker', 'error', { verbose: error })
        }
    }

    /**
     * Cody Custom Commands Menu - a menu with a list of user commands to run
     */
    private async customCommandMenu(): Promise<void> {
        await this.refresh()

        if (!this.isEnabled || !this.custom.hasCustomPrompts()) {
            return this.configMenu()
        }

        try {
            let recentlyUsed = getCustomMenuQuickPickItems(this.getLastUsedCommands()).reverse()
            if (recentlyUsed.length > 0) {
                recentlyUsed = [menu_separators.lastUsed, ...recentlyUsed]
            }

            // Get the list of prompts from the cody.json file
            const commandsFromStore = this.custom.getCommands()
            const customCommands = getCustomMenuQuickPickItems(commandsFromStore)

            const promptItems = [...recentlyUsed, menu_separators.customCommands, ...customCommands]

            const configOption = menu_options.config
            const addOption = menu_options.add

            promptItems.push(menu_separators.settings, configOption, addOption)

            // Show the list of prompts to the user using a quick pick
            const selected = await showCustomCommandMenu([...promptItems])
            const commandKey = selected?.label

            if (!commandKey) {
                return
            }

            switch (commandKey.length > 0) {
                case commandKey === addOption.label:
                    return await this.addNewUserCommandQuick()
                case commandKey === configOption.label:
                    return await this.configMenu('custom')
                default:
                    // Run the prompt
                    await vscode.commands.executeCommand('cody.action.commands.exec', commandKey)
                    break
            }
            logDebug('CommandsController:promptsQuickPicker:selectedPrompt', commandKey)
        } catch (error) {
            logError('CommandsController:promptsQuickPicker', 'error', { verbose: error })
        }
    }

    /**
     * Menu with an option to add a new command via UI and save it to user's cody.json file
     */
    public async configMenu(lastMenu?: string): Promise<void> {
        const selected = await showCommandConfigMenu()
        const action = selected?.id
        if (!selected || !action) {
            return
        }

        if (action === 'back' && lastMenu === 'custom') {
            return this.customCommandMenu()
        }

        logDebug('CommandsController:customPrompts:menu', action)
        await this.configFileAction(action, selected.type, selected.type)

        return this.refresh()
    }

    /**
     * Config file controller
     * handles operations on config files for user and workspace commands
     */
    public async configFileAction(action: string, fileType?: CustomCommandType, filePath?: string): Promise<void> {
        switch (action) {
            case 'add': {
                await this.addNewUserCommandQuick()
                break
            }
            case 'list':
                await this.customCommandMenu()
                break
            case 'docs':
                await openCustomCommandDocsLink()
                break
            case 'delete': {
                if ((await showRemoveConfirmationInput()) !== 'Yes') {
                    return
                }
                await this.custom.deleteConfig(fileType)
                await this.refresh()
                break
            }
            case 'file':
                await this.custom.createConfig(fileType)
                break
            case 'open':
                if (filePath) {
                    await this.open(filePath)
                }
                break
        }
    }

    /**
     * Quick pick menu to create a new user command
     * Allows user to enter the prompt name and prompt description in the input box
     */
    private async addNewUserCommandQuick(): Promise<void> {
        const newCommand = await showNewCustomCommandMenu(this.userCustomCommandsMap)
        if (!newCommand) {
            return
        }
        // Save the prompt to the current Map and Extension storage
        await this.custom.save(newCommand.slashCommand, newCommand.prompt, false, newCommand.type)
        await this.refresh()
        // Notify user
        const buttonTitle = `Open ${newCommand.type === 'user' ? 'User' : 'Workspace'} Settings (JSON)`
        void vscode.window
            .showInformationMessage(
                `New ${newCommand.slashCommand} command saved to ${newCommand.type} settings`,
                buttonTitle
            )
            .then(async choice => {
                if (choice === buttonTitle) {
                    await this.custom.openConfig(newCommand.type)
                }
            })

        logDebug('CommandsController:updateUserCommandQuick:newPrompt:', 'saved', { verbose: newCommand })
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
     * Get the list of recently used commands from the local storage
     */
    private getLastUsedCommands(): [string, CodyCommand][] {
        return [...this.lastUsedCommands]?.map(id => [id, this.default.get(id) as CodyCommand]) || []
    }

    /**
     * Save the last used commands to local storage
     */
    private async saveLastUsedCommands(): Promise<void> {
        const commands = [...this.lastUsedCommands].filter(key => this.default.get(key)?.slashCommand.length)

        if (commands.length > 0) {
            // store the last 5 used commands
            await localStorage.setLastUsedCommands(commands.slice(0, 5))
        }

        this.lastUsedCommands = new Set(commands)
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

        if (!this.isEnabled) {
            return
        }

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
        this.isEnabled = false
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        for (const disposable of this.fileWatcherDisposables) {
            disposable.dispose()
        }
        this.fileWatcherDisposables = []
        this.disposables = []
        this.userCustomCommandsMap = new Map<string, CodyCommand>()
        logDebug('CommandsController:dispose', 'disposed')
    }
}

function getCustomMenuQuickPickItems(commands: [string, CodyCommand][]): vscode.QuickPickItem[] {
    return commands
        ?.filter(command => command !== null && command?.[1]?.type !== 'default')
        .map(commandItem => {
            const label = commandItem[0]
            const command = commandItem[1]
            return createQuickPickItem(label, command.description)
        })
}
