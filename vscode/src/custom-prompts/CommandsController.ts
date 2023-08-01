import * as vscode from 'vscode'

import {
    CodyPrompt,
    CodyPromptType,
    defaultCodyPromptContext,
    MyPrompts,
} from '@sourcegraph/cody-shared/src/chat/recipes/cody-prompts'
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
import { DefaultPromptsStore } from './DefaultPromptsStore'
import {
    CodyMenu_CodyCustomCommands,
    menu_options,
    menu_seperators,
    recentlyUsedSeperatorAsPrompt,
} from './menuOptions'
import { ToolsProvider } from './ToolsProvider'
import { constructFileUri, createFileWatchers, createQuickPickItem, createQuickPickSeperator } from './utils/helpers'

/**
 * Manage commands built with prompts from CustomPromptsStore and DefaultPromptsStore
 * Provides additional prompt management and execution logic
 */
export class CommandsController implements VsCodeCommandsController {
    private tools: ToolsProvider
    private custom: CustomPromptsStore
    public default = new DefaultPromptsStore()

    private myPromptsMap = new Map<string, CodyPrompt>()

    private lastUsedCommands = new Set<string>()
    private myPromptInProgress: CodyPrompt | null = null

    private webViewMessenger: (() => Promise<void>) | null = null
    public wsFileWatcher: vscode.FileSystemWatcher | null = null
    public userFileWatcher: vscode.FileSystemWatcher | null = null

    constructor(
        context: vscode.ExtensionContext,
        private isEnabled: boolean,
        private localStorage: LocalStorage
    ) {
        this.tools = new ToolsProvider(context)
        const user = this.tools.getUserInfo()
        this.custom = new CustomPromptsStore(isEnabled, context.extensionPath, user?.workspaceRoot, user.homeDir)
        this.lastUsedCommands = new Set(this.localStorage.getLastUsedCommands())
        this.watcherInit()
        // Toggle on Config Change
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('cody')) {
                this.checkIsConfigEnabled()
            }
        })
        debug('MyPromptsProvider', 'initialized')
    }

    // Create file watchers for cody.json files used for building Custom Commands
    private watcherInit(): void {
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
        debug('CommandsController:watcherInit', 'watchers created')
    }

    // dispose and reset the controller and builder
    public dispose(): void {
        this.isEnabled = false
        this.custom.dispose()
        this.myPromptInProgress = null
        this.myPromptsMap = new Map<string, CodyPrompt>()
        this.wsFileWatcher?.dispose()
        this.userFileWatcher?.dispose()
        debug('CommandsController:dispose', 'disposed')
    }

    // Check if the config is enabled on config change, and toggle the builder
    private checkIsConfigEnabled(): void {
        const config = vscode.workspace.getConfiguration('cody')
        const newConfig = config.get('experimental.customCommands') as boolean
        this.isEnabled = newConfig
        this.custom.activate(newConfig)
        if (newConfig && this.isEnabled) {
            this.watcherInit()
        }
        if (!newConfig) {
            this.dispose()
        }
    }

    // getter for the promptInProgress
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

    // Find a command based on its id / title
    public find(id: string, isSlash = false): string {
        const myPrompt = this.default.get(id, isSlash)
        if (myPrompt) {
            debug('CommandsController:find:command', id, { verbose: myPrompt })
            this.myPromptInProgress = myPrompt
            this.lastUsedCommands.add(id)
            return myPrompt?.prompt
        }
        return ''
    }

    // get the list of commands names to share with the webview to display
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

    // Get the prompts from cody.json file then build the map of prompts
    public async refresh(): Promise<void> {
        await this.saveLastUsedCommands()
        const { commands } = await this.custom.refresh()
        this.myPromptsMap = commands
        this.default.groupCommands(commands)
    }

    private async saveLastUsedCommands(): Promise<void> {
        // store the last 3 used commands
        const lastUsedCommands = [...this.lastUsedCommands].slice(-3)
        if (lastUsedCommands.length > 0) {
            await this.localStorage.setLastUsedCommands(lastUsedCommands)
        }
        this.lastUsedCommands = new Set(lastUsedCommands)
    }

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

    // Cody Custom Commands Menu - a menu with a list of user commands to run
    public async customCommandMenu(): Promise<void> {
        await this.refresh()
        if (!this.isEnabled || !this.custom.hasCustomPrompts()) {
            return this.configMenu()
        }
        try {
            const lastUsedCommands = this.getRecentlyUsedCommands()
            const recentlyUsed = [...recentlyUsedSeperatorAsPrompt, ...lastUsedCommands] as [string, CodyPrompt][]
            // Get the list of prompts from the cody.json file
            const commandsFromStore = this.custom.getCommands()
            const promptList = lastUsedCommands.length ? [...recentlyUsed, ...commandsFromStore] : commandsFromStore
            const promptItems = promptList
                ?.filter(command => command !== null && command?.[1]?.type !== 'default')
                .map(commandItem => {
                    const command = commandItem[1]
                    const description = command.slashCommand ? '/' + command.slashCommand : command.type
                    return command.prompt === 'seperator'
                        ? createQuickPickSeperator(command.type, command.prompt)
                        : createQuickPickItem(command.name || commandItem[0], description)
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

    // Menu with an option to add a new command via UI and save it to user's cody.json file
    public async configMenu(): Promise<void> {
        if (!this.isEnabled) {
            const enableResponse = await vscode.window.showInformationMessage(
                'Please first enable `Custom Commands` before trying again.',
                'Enable Custom Commands',
                'Cancel'
            )
            if (enableResponse === 'Enable Custom Commands') {
                await vscode.commands.executeCommand('cody.status-bar.interacted')
            }
            return
        }
        const promptSize = this.custom.promptSize.user + this.custom.promptSize.workspace
        const selected = await showCustomPromptMenu()
        const selectedAction = promptSize === 0 ? 'file' : selected?.actionID
        if (!selected || !selectedAction) {
            return
        }
        debug('CommandsController:customPrompts:menu', selectedAction)
        switch (selectedAction) {
            case 'delete':
            case 'file':
            case 'open': {
                const fileType =
                    selected.commandType || (await showcommandTypeQuickPick(selectedAction, this.custom.promptSize))
                if (fileType) {
                    await this.config(selectedAction, fileType)
                }
                break
            }
            case 'add': {
                if (selected?.commandType === 'user') {
                    await this.addNewUserCommandQuick()
                    break
                }
                const wsFileAction = this.custom.promptSize.workspace === 0 ? 'file' : 'open'
                await this.config(wsFileAction, 'workspace')
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

    // Get the prompt name and prompt description from the user using the input box
    // Add new command to user's .vscode/cody.json file
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

    // Config file handler for user and workspace commands
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
            default:
                break
        }
    }

    // Open workspace file in editor
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

    private getRecentlyUsedCommands(): (string | CodyPrompt)[][] {
        const commands = [...this.lastUsedCommands]
            ?.map(id => [id, this.myPromptsMap.get(id) as CodyPrompt])
            .filter(command => command[1] !== undefined)
            ?.reverse()
        return commands
    }

    public setMessenger(messenger: () => Promise<void>): void {
        if (this.webViewMessenger) {
            return
        }
        this.webViewMessenger = messenger
    }
}
