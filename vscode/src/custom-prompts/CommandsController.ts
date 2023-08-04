import * as vscode from 'vscode'

import {
    CodyPrompt,
    CodyPromptType,
    defaultCodyPromptContext,
    MyPrompts,
} from '@sourcegraph/cody-shared/src/chat/prompts'
import { VsCodeCommandsController } from '@sourcegraph/cody-shared/src/editor'

import { debug } from '../log'
import { LocalStorage } from '../services/LocalStorageProvider'

import { CustomPromptsStore } from './CustomPromptsStore'
import { showCommandConfigMenu, showCommandMenu, showCustomCommandMenu, showNewCustomCommandMenu } from './menus'
import { PromptsProvider } from './PromptsProvider'
import { ToolsProvider } from './ToolsProvider'
import { constructFileUri, createFileWatchers, createQuickPickItem, openCustomCommandDocsLink } from './utils/helpers'
import { menu_options, menu_separators, showcommandTypeQuickPick, showRemoveConfirmationInput } from './utils/menu'

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
    private myPromptInProgress: CodyPrompt | null = null

    private webViewMessenger: (() => Promise<void>) | null = null
    public wsFileWatcher: vscode.FileSystemWatcher | null = null
    public userFileWatcher: vscode.FileSystemWatcher | null = null

    constructor(
        context: vscode.ExtensionContext,
        private localStorage: LocalStorage
    ) {
        this.tools = new ToolsProvider(context)
        const user = this.tools.getUserInfo()

        this.custom = new CustomPromptsStore(this.isEnabled, context.extensionPath, user?.workspaceRoot, user.homeDir)
        this.disposables.push(this.custom)

        this.lastUsedCommands = new Set(this.localStorage.getLastUsedCommands())
        this.custom.activate()
        this.fileWatcherInit()
    }

    /**
     * Get the prompt, context, output, or current prompt name based on the passed type and id.
     *
     * @param type - The type of data to return. Valid values:
     *   - 'prompt' - Return the prompt text for the command with the given id.
     *   - 'context' - Return the context for the current prompt in progress as a JSON string.
     *   - 'codebase' - Return 'codebase' if there is a codebase in the current context.
     *   - 'output' - Return the output for the current prompt in progress.
     *   - 'command' - Return the output from executing the command for the current prompt.
     *   - 'current' - Return the name of the current prompt in progress.
     * @param id - The id of the command to get the prompt for if type is 'prompt'.
     *
     * @returns The requested data based on type, or null if not found.
     */
    public async get(type?: string, id?: string): Promise<string | null> {
        await this.refresh()

        switch (type) {
            case 'prompt':
                return id ? this.default.get(id)?.prompt || null : null
            case 'context':
                return JSON.stringify(this.myPromptInProgress?.context || { ...defaultCodyPromptContext })
            case 'codebase':
                return this.myPromptInProgress?.context?.codebase ? 'codebase' : null
            case 'output':
                return this.myPromptInProgress?.context?.output || null
            case 'command':
                // return the terminal output from the command for the prompt if any
                return this.execCommand()
            case 'current':
                return this.myPromptInProgress?.name || null
            default:
                return this.myPromptInProgress?.prompt || null
        }
    }

    /**
     * Find the text of the prompt for a command based on its id / title
     * then set it as the prompt in progress
     *
     * @param id - The id/name of the command
     * @param isSlash - Whether this is a slash command
     *
     * @returns The prompt text for the command if found, empty string otherwise
     */
    public find(id: string, isSlash = false): string {
        const myPrompt = this.default.get(id, isSlash)

        debug('CommandsController:find:command', id, { verbose: myPrompt })

        if (myPrompt) {
            this.myPromptInProgress = myPrompt
            this.lastUsedCommands.add(id)
        }

        return myPrompt?.prompt || ''
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
     * Executes the command stored in the prompt context if available.
     *
     * @returns The output of the command execution, or null if no command was found.
     */
    private async execCommand(): Promise<string | null> {
        const currentContext = this.myPromptInProgress?.context
        if (!this.myPromptInProgress || !currentContext?.command) {
            return null
        }
        const fullCommand = currentContext.command
        const commandOutput = await this.tools.exeCommand(fullCommand)
        currentContext.output = commandOutput
        this.myPromptInProgress.context = currentContext
        return commandOutput || null
    }

    /**
     * Menu Controller
     */
    public async menu(type: 'custom' | 'config' | 'default', showDesc?: boolean): Promise<void> {
        await this.refresh()
        switch (type) {
            case 'custom':
                await this.customCommandMenu()
                break
            case 'config':
                await this.configMenu()
                break
            case 'default':
                await this.mainCommandMenu(showDesc)
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
    public async mainCommandMenu(showDesc = false): Promise<void> {
        try {
            const commandItems = [menu_separators.chat, menu_options.chat, menu_separators.commands]
            const allCommands = this.default.getGroupedCommands(true)
            const allCommandItems = [...allCommands]?.map(commandItem => {
                const command = commandItem[1]
                if (command.prompt === 'separator') {
                    return menu_separators.customCommands
                }
                const description =
                    showDesc && command.slashCommand && command.type === 'default'
                        ? command.slashCommand
                        : command.type !== 'default'
                        ? command.type
                        : ''

                return createQuickPickItem(command.name || commandItem[0], description)
            })
            commandItems.push(...allCommandItems, menu_options.config)

            // Show the list of prompts to the user using a quick pick menu
            // const selectedPrompt = await vscode.window.showQuickPick([...commandItems], CodyMenu_CodyCommands)
            const selectedPrompt = await showCommandMenu([...commandItems])
            if (!selectedPrompt) {
                return
            }

            const selectedCommandID = selectedPrompt.label
            switch (true) {
                case !selectedCommandID:
                    break
                case selectedCommandID === menu_options.config.label:
                    return await vscode.commands.executeCommand('cody.settings.commands')
                case selectedCommandID === menu_options.chat.label:
                    return await vscode.commands.executeCommand('cody.inline.new')
                case selectedCommandID === menu_options.submit.label:
                    return await vscode.commands.executeCommand('cody.action.chat', selectedPrompt.detail)
            }

            // Run the prompt
            const prompt = await this.get('prompt', selectedCommandID)
            if (!prompt) {
                return
            }

            await vscode.commands.executeCommand('cody.action.commands.exec', selectedCommandID)
        } catch (error) {
            debug('CommandsController:commandQuickPicker', 'error', { verbose: error })
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
                    const description = command.type
                    return createQuickPickItem(command.name || commandItem[0], description)
                })

            const configOption = menu_options.config
            const addOption = menu_options.add
            promptItems.push(menu_separators.settings, configOption, addOption)

            // Show the list of prompts to the user using a quick pick
            const selectedPrompt = await showCustomCommandMenu([...promptItems])
            // Find the prompt based on the selected prompt name
            const promptTitle = selectedPrompt?.label
            if (!selectedPrompt || !promptTitle) {
                return
            }

            switch (promptTitle.length > 0) {
                case promptTitle === addOption.label:
                    return await this.addNewUserCommandQuick()
                case promptTitle === configOption.label:
                    return await this.configMenu('custom')
                default:
                    // Run the prompt
                    await vscode.commands.executeCommand('cody.action.commands.exec', promptTitle)
                    break
            }

            debug('CommandsController:promptsQuickPicker:selectedPrompt', promptTitle)
        } catch (error) {
            debug('CommandsController:promptsQuickPicker', 'error', { verbose: error })
        }
    }

    /**
     * Menu with an option to add a new command via UI and save it to user's cody.json file
     */
    public async configMenu(lastMenu?: string): Promise<void> {
        const promptSize = this.custom.promptSize.user + this.custom.promptSize.workspace
        const selected = await showCommandConfigMenu()
        const action = promptSize === 0 ? 'file' : selected?.id
        if (!selected || !action) {
            return
        }

        if (action === 'back' && lastMenu === 'custom') {
            return this.customCommandMenu()
        }

        debug('CommandsController:customPrompts:menu', action)

        switch (action) {
            case 'delete':
            case 'file':
            case 'open': {
                const type = selected.type || (await showcommandTypeQuickPick(action, this.custom.promptSize))
                await this.config(action, type)
                break
            }
            case 'add': {
                if (selected?.type === 'workspace') {
                    const wsFileAction = this.custom.promptSize.workspace === 0 ? 'file' : 'open'
                    await this.config(wsFileAction, 'workspace')
                    break
                }
                await this.config(action, selected?.type)
                break
            }
            case 'list':
                await this.customCommandMenu()
                break
            case 'example':
                await openCustomCommandDocsLink()
                break
        }

        return this.refresh()
    }

    /**
     * Config file controller
     * handles operations on config files for user and workspace commands
     */
    public async config(action: string, fileType: CodyPromptType): Promise<void> {
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
                await this.open(fileType)
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
        await this.custom.save(newCommand.title, newCommand.prompt)
        await this.refresh()

        debug('CommandsController:updateUserCommandQuick:newPrompt:', 'saved', { verbose: newCommand })
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
            await this.localStorage.setLastUsedCommands(commands)
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

        debug('CommandsController:fileWatcherInit', 'watchers created')
    }

    /**
     * Dispose and reset the controller and builder
     */
    public dispose(): void {
        this.isEnabled = false
        this.myPromptInProgress = null
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        for (const disposable of this.fileWatcherDisposables) {
            disposable.dispose()
        }
        this.fileWatcherDisposables = []
        this.disposables = []
        this.myPromptsMap = new Map<string, CodyPrompt>()
        debug('CommandsController:dispose', 'disposed')
    }
}
