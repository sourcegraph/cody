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
import { ToolsProvider } from './ToolsProvider'
import { constructFileUri, createFileWatchers, createJSONFile, lastUsedCommandsSeperator } from './utils'

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
        private context: vscode.ExtensionContext,
        private isEnabled: boolean,
        private localStorage: LocalStorage
    ) {
        this.tools = new ToolsProvider(context)
        const user = this.tools.getUserInfo()
        this.custom = new CustomPromptsStore(isEnabled, user?.workspaceRoot, user.homeDir)
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

    public setMessenger(messenger: () => Promise<void>): void {
        if (this.webViewMessenger) {
            return
        }
        this.webViewMessenger = messenger
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
        const newConfig = config.get('experimental.customPrompts') as boolean
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
                return this.getCommandOutput()
            default:
                return this.myPromptInProgress?.prompt || null
        }
    }

    // Open workspace file in editor
    public async open(filePath: string): Promise<void> {
        if (filePath === 'user' || filePath === 'workspace') {
            return this.tools.openFile(this.custom.jsonFileUris[filePath])
        }
        const fileUri = constructFileUri(filePath, this.tools.getUserInfo()?.workspaceRoot)
        return vscode.commands.executeCommand('vscode.open', fileUri)
    }

    // Find the prompt based on the id
    public find(id: string, isSlash = false): string {
        const myPrompt = this.default.get(id, isSlash)
        if (!myPrompt) {
            return ''
        }
        debug('CommandsController:find:myPrompt', id, { verbose: myPrompt })
        this.myPromptInProgress = myPrompt
        this.lastUsedCommands.add(id)
        return myPrompt?.prompt
    }

    // get the list of commands names to share with the webview to display
    public getCommands(): [string, CodyPrompt][] {
        return this.custom.getCommands().filter(command => command[1].prompt !== 'seperator')
    }

    // Get the prompts and premade for client to use
    public async getMyPrompts(): Promise<MyPrompts> {
        const myPromptsConfig = await this.custom.refresh()
        return myPromptsConfig
    }

    public async getCommandOutput(): Promise<string | null> {
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
        const { prompts } = await this.custom.refresh()
        this.myPromptsMap = prompts
        this.default.groupCommands(prompts)
    }

    private async saveLastUsedCommands(): Promise<void> {
        // store the last 3 used commands
        const lastUsedCommands = [...this.lastUsedCommands].slice(-3)
        if (lastUsedCommands.length > 0) {
            await this.localStorage.setLastUsedCommands(lastUsedCommands)
        }
        this.lastUsedCommands = new Set(lastUsedCommands)
    }

    // Clear the user prompts from the extension storage
    public async clear(type: CodyPromptType = 'user'): Promise<void> {
        await this.custom.delete(type)
        await this.refresh()
    }

    // Add a new cody.json file to the user's workspace or home directory
    public async addJSONFile(type: CodyPromptType): Promise<void> {
        try {
            const extensionPath = this.context.extensionPath
            const isUserType = type === 'user'
            const configFileUri = isUserType ? this.custom.jsonFileUris.user : this.custom.jsonFileUris.workspace
            if (!configFileUri) {
                throw new Error('Please make sure you have a repository opened in your workspace.')
            }
            await createJSONFile(extensionPath, configFileUri, isUserType)
        } catch (error) {
            const errorMessage = 'Failed to create cody.json file: '
            void vscode.window.showErrorMessage(`${errorMessage} ${error}`)
            debug('CommandsController:addJSONFile:create', 'failed', { verbose: error })
        }
    }

    // Menu with an option to add a new command via UI and save it to user's cody.json file
    public async menu(): Promise<void> {
        const promptSize = this.custom.promptSize.user + this.custom.promptSize.workspace
        const selectedOption = await showCustomPromptMenu()
        const selected = promptSize === 0 ? 'file' : selectedOption?.actionID
        if (!selectedOption || !selected) {
            return
        }
        debug('CommandsController:customPrompts:menu', selected)
        if (selected === 'delete' || selected === 'file' || selected === 'open') {
            const fileType = await showcommandTypeQuickPick(selected, this.custom.promptSize)
            if (!fileType) {
                return
            }
            await this.fileTypeActionProcessor(selected, fileType)
        } else if (selected === 'add') {
            if (selectedOption?.commandType === 'user') {
                await this.updateUserCommandQuick()
            } else {
                const wsFileAction = this.custom.promptSize.workspace === 0 ? 'file' : 'open'
                await this.fileTypeActionProcessor(wsFileAction, 'workspace')
            }
        } else if (selected === 'list') {
            await this.promptsQuickPicker()
        }
        await this.refresh()
    }

    public async mainMenu(type: 'custom' | 'default'): Promise<void> {
        return type === 'default' ? this.default.menu() : this.menu()
    }

    // Menu with a list of user commands to run
    public async promptsQuickPicker(): Promise<void> {
        if (this.myPromptsMap.size === 0) {
            await this.menu()
            return
        }
        try {
            const lastUsedCommands = [...this.lastUsedCommands]
                ?.map(id => {
                    const command = this.myPromptsMap.get(id)
                    return command ? [id, command] : null
                })
                ?.reverse()
            const lastUsedCommandsList = [...lastUsedCommandsSeperator, ...lastUsedCommands] as [string, CodyPrompt][]
            // Get the list of prompts from the cody.json file
            const commandsFromStore = this.custom.getCommands()
            const promptList = lastUsedCommands.length
                ? [...lastUsedCommandsList, ...commandsFromStore]
                : commandsFromStore
            const promptItems = promptList
                ?.filter(command => command !== null && command?.[1]?.type !== 'default')
                .map(commandItem => {
                    const command = commandItem[1]
                    const description = command.slashCommand ? '/' + command.slashCommand : ''
                    return command.prompt === 'seperator'
                        ? {
                              kind: -1,
                              label: command.type,
                              detail: command.prompt,
                          }
                        : {
                              label: command.name || commandItem[0],
                              description,
                          }
                }) as vscode.QuickPickItem[]
            const seperator: vscode.QuickPickItem = { kind: -1, label: 'action' }
            const addOption: vscode.QuickPickItem = { label: 'New Custom Command...', alwaysShow: true }
            promptItems.push(seperator, addOption)
            // Show the list of prompts to the user using a quick pick
            const options = { title: 'Cody Custom Commands', placeHolder: 'Search command to run...' }
            const selectedPrompt = await vscode.window.showQuickPick([...promptItems], options)
            if (!selectedPrompt) {
                return
            }
            // Find the prompt based on the selected prompt name
            const promptTitle = selectedPrompt.label
            if (promptTitle === addOption.label) {
                await this.updateUserCommandQuick()
                return
            }
            if (!promptTitle) {
                return
            }
            debug('CommandsController:promptsQuickPicker:selectedPrompt', promptTitle)
            // Run the prompt
            await vscode.commands.executeCommand('cody.customPrompts.exec', promptTitle)
        } catch (error) {
            debug('CommandsController:promptsQuickPicker', 'error', { verbose: error })
        }
    }

    // Get the prompt name and prompt description from the user using the input box
    // Add new command to user's .vscode/cody.json file
    private async updateUserCommandQuick(): Promise<void> {
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

    // Show the menu for the actions that require file type selection
    private async fileTypeActionProcessor(action: string, fileType: CodyPromptType): Promise<void> {
        switch (action) {
            case 'delete':
                if ((await showRemoveConfirmationInput()) !== 'Yes') {
                    return
                }
                await this.clear(fileType)
                break
            case 'file':
                await this.addJSONFile(fileType)
                break
            case 'open':
                await this.open(fileType)
                break
            default:
                break
        }
    }
}
