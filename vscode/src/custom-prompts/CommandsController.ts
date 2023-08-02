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

import {
    createNewPrompt,
    showcommandTypeQuickPick,
    showCustomPromptMenu,
    showPromptNameInput,
    showRemoveConfirmationInput,
} from './CustomPromptsMenu'
import { CustomPromptsStore } from './CustomPromptsStore'
import { PromptsProvider } from './PromptsProvider'
import { ToolsProvider } from './ToolsProvider'
import { constructFileUri, createFileWatchers, createQuickPickItem } from './utils/helpers'
import { CodyMenu_CodyCustomCommands, menu_options, menu_seperators } from './utils/menu'

/**
 * Manage commands built with prompts from CustomPromptsStore and PromptsProvider
 * Provides additional prompt management and execution logic
 */
export class CommandsController implements VsCodeCommandsController {
    private isEnabled = true

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
        this.lastUsedCommands = new Set(this.localStorage.getLastUsedCommands())
        this.custom.activate()
        this.fileWatcherInit()
    }

    /**
     * getter for the promptInProgress
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
            default:
                return this.myPromptInProgress?.prompt || null
        }
    }

    /**
     * Find the text of the prompt for a command based on its id / title
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
     * get the list of commands names to share with the webview to display
     */
    public getAllCommands(): [string, CodyPrompt][] {
        return this.default.getGroupedCommands().filter(command => command[1].prompt !== 'seperator')
    }

    // Get the prompts and premade for client to use
    public async getCustomConfig(): Promise<MyPrompts> {
        const myPromptsConfig = await this.custom.refresh()
        return myPromptsConfig
    }

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
                await this.default.menu(showDesc)
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
     * Cody Custom Commands Menu - a menu with a list of user commands to run
     */
    public async customCommandMenu(): Promise<void> {
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
                    const description =
                        command.slashCommand && command.type === 'default' ? '/' + command.slashCommand : command.type
                    return createQuickPickItem(command.name || commandItem[0], description)
                })

            const configOption = menu_options.config
            const addOption = menu_options.add
            promptItems.push(menu_seperators.settings, configOption, addOption)

            // Show the list of prompts to the user using a quick pick
            const selectedPrompt = await vscode.window.showQuickPick([...promptItems], CodyMenu_CodyCustomCommands)
            // Find the prompt based on the selected prompt name
            const promptTitle = selectedPrompt?.label
            if (!selectedPrompt || !promptTitle) {
                return
            }

            switch (promptTitle.length > 0) {
                case promptTitle === addOption.label:
                    return await this.addNewUserCommandQuick()
                case promptTitle === configOption.label:
                    return await this.configMenu()
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
    public async configMenu(): Promise<void> {
        const promptSize = this.custom.promptSize.user + this.custom.promptSize.workspace
        const selected = await showCustomPromptMenu()
        const action = promptSize === 0 ? 'file' : selected?.actionID
        if (!selected || !action) {
            return
        }
        debug('CommandsController:customPrompts:menu', action)
        switch (action) {
            case 'delete':
            case 'file':
            case 'open': {
                const type = selected.commandType || (await showcommandTypeQuickPick(action, this.custom.promptSize))
                await this.config(action, type)
                break
            }
            case 'add': {
                if (selected?.commandType === 'workspace') {
                    const wsFileAction = this.custom.promptSize.workspace === 0 ? 'file' : 'open'
                    await this.config(wsFileAction, 'workspace')
                    break
                }
                await this.config(action, selected?.commandType)
                break
            }
            case 'list':
                await this.customCommandMenu()
                break
            case 'example':
                await this.custom.createExampleConfig()
                break
        }
        await this.refresh()
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
        const promptName = (await showPromptNameInput(this.myPromptsMap)) || null
        if (!promptName) {
            return
        }
        const newPrompt = await createNewPrompt(promptName)
        if (!newPrompt) {
            return
        }
        // Save the prompt to the current Map and Extension storage
        await this.custom.save(promptName, newPrompt)
        await this.refresh()
        debug('CommandsController:updateUserCommandQuick:newPrompt:', 'saved', { verbose: newPrompt })
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
        const commands = [...this.lastUsedCommands].filter(command => command !== 'seperator').slice(0, 3)
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

    /**
     * Create file watchers for cody.json files used for building Custom Commands
     */
    private fileWatcherInit(): void {
        if (!this.isEnabled) {
            return
        }
        const user = this.tools.getUserInfo()
        this.wsFileWatcher = createFileWatchers(user?.workspaceRoot)
        this.userFileWatcher = createFileWatchers(user?.homeDir)
        this.wsFileWatcher?.onDidChange(() => this.webViewMessenger?.())
        this.userFileWatcher?.onDidChange(() => this.webViewMessenger?.())
        this.wsFileWatcher?.onDidDelete(() => this.webViewMessenger?.())
        this.userFileWatcher?.onDidDelete(() => this.webViewMessenger?.())
        debug('CommandsController:fileWatcherInit', 'watchers created')
    }

    /**
     * Dispose and reset the controller and builder
     */
    public dispose(): void {
        this.isEnabled = false
        this.custom.dispose()
        this.myPromptInProgress = null
        this.myPromptsMap = new Map<string, CodyPrompt>()
        this.wsFileWatcher?.dispose()
        this.userFileWatcher?.dispose()
        debug('CommandsController:dispose', 'disposed')
    }
}
