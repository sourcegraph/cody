import * as vscode from 'vscode'

import { CodyPrompt, CustomCommandType, MyPrompts } from '@sourcegraph/cody-shared/src/chat/prompts'
import { VsCodeCommandsController } from '@sourcegraph/cody-shared/src/editor'

import { logDebug, logError } from '../log'
import { localStorage } from '../services/LocalStorageProvider'

import { CommandRunner } from './CommandRunner'
import { CustomPromptsStore } from './CustomPromptsStore'
import { showCommandConfigMenu, showCommandMenu, showCustomCommandMenu, showNewCustomCommandMenu } from './menus'
import { PromptsProvider } from './PromptsProvider'
import { ToolsProvider } from './ToolsProvider'
import { constructFileUri, createFileWatchers, createQuickPickItem, openCustomCommandDocsLink } from './utils/helpers'
import {
    menu_options,
    menu_separators,
    showAskQuestionQuickPick,
    showcommandTypeQuickPick,
    showRemoveConfirmationInput,
} from './utils/menu'

/**
 * Manage commands built with prompts from CustomPromptsStore and PromptsProvider
 * Provides additional prompt management and execution logic
 */
export class CommandsController implements VsCodeCommandsController, vscode.Disposable {
    private isEnabled = true

    private disposables: vscode.Disposable[] = []

    private tools: ToolsProvider
    private custom: CustomPromptsStore
    public default = new PromptsProvider()

    private myPromptsMap = new Map<string, CodyPrompt>()

    private lastUsedCommands = new Set<string>()

    private webViewMessenger: (() => Promise<void>) | null = null
    public wsFileWatcher: vscode.FileSystemWatcher | null = null
    public userFileWatcher: vscode.FileSystemWatcher | null = null

    public commandRunners = new Map<string, CommandRunner>()

    constructor(context: vscode.ExtensionContext) {
        this.tools = new ToolsProvider(context)
        const user = this.tools.getUserInfo()

        this.custom = new CustomPromptsStore(this.isEnabled, context.extensionPath, user?.workspaceRoot, user.homeDir)
        this.disposables.push(this.custom)

        this.lastUsedCommands = new Set(localStorage.getLastUsedCommands())
        this.custom.activate()
        this.fileWatcherInit()
    }

    /**
     * Gets a CodyPrompt object for the given command runner ID.
     *
     * @param commandRunnerId - The ID of the command runner to get the prompt for.
     *
     * @returns The CodyPrompt object for the command runner, or null if not found.
     *
     * Looks up the command runner instance in the commandRunners map by the given ID.
     * If found, returns the CodyPrompt associated with that runner. Otherwise returns null.
     */
    public getCommand(commandRunnerId: string): CodyPrompt | null {
        const commandRunner = this.commandRunners.get(commandRunnerId)
        if (!commandRunner) {
            return null
        }
        this.commandRunners.delete(commandRunnerId)
        return commandRunner?.codyCommand
    }

    /**
     * Adds a new command to the commands map.
     *
     * @param key - The unique key for the command. e.g. /test
     * @param input - Optional input text from the user.
     *
     * @returns A promise resolving to the command ID string if successful,
     * or 'invalid' if the command is not found.
     *
     * Looks up the command prompt using the given key in the default prompts map.
     * If found, creates a new Cody command runner instance for that prompt and input.
     * Returns the ID of the created runner, or 'invalid' if not found.
     */
    public async addCommand(key: string, input?: string): Promise<string> {
        const command = this.default.get(key)
        if (!command) {
            return 'invalid'
        }
        return this.createCodyCommand(command, input)
    }

    /**
     * Creates a new Cody command runner instance and returns the ID.
     *
     * This creates a new CommandRunner instance with the given CodyPrompt, input text,
     * and fixup request flag. It adds the runner to the commandRunners map, sets it
     * as the current prompt in progress, and logs the command usage.
     *
     * If the prompt has a shell command in its context, it will execute that command.
     *
     * Finally, it returns the unique ID for the created CommandRunner instance.
     */
    private async createCodyCommand(command: CodyPrompt, input = ''): Promise<string> {
        const commandKey = command.slashCommand
        const defaultEditCommands = new Set(['/edit', '/fix', '/doc'])
        const isFixupRequest = defaultEditCommands.has(commandKey) || command.prompt.startsWith('/edit')

        logDebug('CommandsController:createCodyCommand:creating', commandKey)

        // Start the command runner
        const codyCommand = new CommandRunner(command, input, isFixupRequest)
        this.commandRunners.set(codyCommand.id, codyCommand)
        this.lastUsedCommands.add(command.slashCommand)

        // Fixup request will be taken care by the fixup recipe in the CommandRunner
        if (isFixupRequest || command.mode === 'inline') {
            return ''
        }

        // Run shell command if any
        const shellCommand = command.context?.command
        if (shellCommand) {
            await codyCommand.runShell(this.tools.exeCommand(shellCommand))
        }

        return codyCommand.id
    }

    /**
     * Get the list of command names and prompts to send to the webview for display.
     *
     * @returns An array of tuples containing the command name and prompt object.
     */
    public async getAllCommands(keepSperator = false): Promise<[string, CodyPrompt][]> {
        await this.refresh()
        return this.default.getGroupedCommands(keepSperator)
    }

    /**
     * Gets the custom prompt configuration by refreshing the store.
     *
     * @returns The custom prompt configuration object containing the prompt map, premade text, and starter text.
     */
    public async getCustomConfig(): Promise<MyPrompts> {
        const myPromptsConfig = await this.custom.refresh()
        return myPromptsConfig
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
        this.myPromptsMap = commands
        this.default.groupCommands(commands)
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
                ...commands,
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
                        return await vscode.commands.executeCommand('cody.action.chat', input)
                    }
                    input = await showAskQuestionQuickPick()
                    await vscode.commands.executeCommand('cody.chat.focus')
                    return await vscode.commands.executeCommand('cody.action.chat', input)
                }
                case selectedCommandID === menu_options.fix.slashCommand: {
                    const source = 'menu'
                    return await vscode.commands.executeCommand(
                        'cody.command.edit-code',
                        { instruction: userPrompt.trim() },
                        source
                    )
                }
            }

            await vscode.commands.executeCommand('cody.action.commands.exec', selectedCommandID)
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
            const recentlyUsed = this.getLastUsedCommands()

            // Get the list of prompts from the cody.json file
            const commandsFromStore = this.custom.getCommands()
            const promptList = recentlyUsed.length ? [...recentlyUsed, ...commandsFromStore] : commandsFromStore

            const promptItems = promptList
                ?.filter(command => command !== null && command?.[1]?.type !== 'default')
                .map(commandItem => {
                    const command = commandItem[1]
                    const description = commandItem[0]
                    return createQuickPickItem(command.description, description)
                })

            const configOption = menu_options.config
            const addOption = menu_options.add

            promptItems.push(menu_separators.settings, configOption, addOption)

            // Show the list of prompts to the user using a quick pick
            const selected = await showCustomCommandMenu([...promptItems])
            const commandKey = selected?.description

            if (!selected || !commandKey) {
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

        switch (action) {
            case 'delete':
            case 'file':
            case 'open': {
                const type = selected.type || (await showcommandTypeQuickPick(action, this.custom.promptSize))
                await this.config(action, type)
                break
            }
            case 'add': {
                await this.config(action)
                break
            }
            case 'list':
                await this.customCommandMenu()
                break
            case 'docs':
                await openCustomCommandDocsLink()
                break
        }

        return this.refresh()
    }

    /**
     * Config file controller
     * handles operations on config files for user and workspace commands
     */
    public async config(action: string, fileType?: CustomCommandType): Promise<void> {
        switch (action) {
            case 'delete':
                if ((await showRemoveConfirmationInput()) !== 'Yes') {
                    return
                }
                await this.custom.deleteConfig(fileType)
                await this.refresh()
                break
            case 'file':
                await this.custom.createConfig(fileType)
                break
            case 'open':
                if (fileType) {
                    await this.open(fileType)
                }
                break
            case 'add':
                await this.addNewUserCommandQuick()
                break
            default:
                break
        }
    }

    /**
     * Quick pick menu to create a new user command
     * Allows user to enter the prompt name and prompt description in the input box
     */
    private async addNewUserCommandQuick(): Promise<void> {
        const newCommand = await showNewCustomCommandMenu(this.myPromptsMap)
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
            return doesExist ? this.tools.openFile(uri) : this.config('file', filePath)
        }
        const fileUri = constructFileUri(filePath, this.tools.getUserInfo()?.workspaceRoot)

        return vscode.commands.executeCommand('vscode.open', fileUri)
    }

    /**
     * Get the list of recently used commands from the local storage
     */
    private getLastUsedCommands(): [string, CodyPrompt][] {
        const commands = [...this.lastUsedCommands]?.map(id => [id, this.myPromptsMap.get(id) as CodyPrompt])?.reverse()
        const filtered = commands?.filter(command => command[1] !== undefined) as [string, CodyPrompt][]

        return filtered.length > 0 ? filtered : []
    }

    /**
     * Save the last used commands to local storage
     */
    private async saveLastUsedCommands(): Promise<void> {
        // store the last 3 used commands
        const commands = [...this.lastUsedCommands].filter(command => command !== 'separator').slice(0, 3)
        if (commands.length > 0) {
            await localStorage.setLastUsedCommands(commands)
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
        for (const runner of this.commandRunners) {
            runner[1].dispose()
        }
        for (const disposable of this.fileWatcherDisposables) {
            disposable.dispose()
        }
        this.fileWatcherDisposables = []
        this.disposables = []
        this.myPromptsMap = new Map<string, CodyPrompt>()
        this.commandRunners = new Map()
        logDebug('CommandsController:dispose', 'disposed')
    }
}
