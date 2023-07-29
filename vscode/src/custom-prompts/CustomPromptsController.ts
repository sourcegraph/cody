import * as vscode from 'vscode'

import {
    CodyPrompt,
    CodyPromptType,
    defaultCodyPromptContext,
    MyPrompts,
} from '@sourcegraph/cody-shared/src/chat/recipes/cody-prompts'
import { VsCodeCustomPromptsController } from '@sourcegraph/cody-shared/src/editor'

import { debug } from '../log'
import { DefaultPromptsProvider } from '../prompts/DefaultPromptsProvider'
import { LocalStorage } from '../services/LocalStorageProvider'

import {
    createNewPrompt,
    showCustomPromptMenu,
    showPromptNameInput,
    showRecipeTypeQuickPick,
    showRemoveConfirmationInput,
} from './CustomPromptsMenu'
import { CustomPromptsStore } from './CustomPromptsStore'
import { ToolsProvider } from './ToolsProvider'
import {
    constructFileUri,
    createFileWatchers,
    createJSONFile,
    deleteFile,
    lastUsedCommandsSeperator,
    saveJSONFile,
} from './utils'

/**
 * Utilizes CustomPromptsStore to get the built prompt data
 * Provides additional prompt management and execution logic
 * NOTE: Dogfooding - Internal s2 users only
 */
export class CustomPromptsController implements VsCodeCustomPromptsController {
    private tools: ToolsProvider
    private store: CustomPromptsStore
    public default = new DefaultPromptsProvider()

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
        this.store = new CustomPromptsStore(isEnabled, user?.workspaceRoot, user.homeDir)
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
        debug('CustomPromptsController:watcherInit', 'watchers created')
    }

    // dispose and reset the controller and builder
    public dispose(): void {
        this.isEnabled = false
        this.store.dispose()
        this.myPromptInProgress = null
        this.myPromptsMap = new Map<string, CodyPrompt>()
        this.wsFileWatcher?.dispose()
        this.userFileWatcher?.dispose()
        debug('CustomPromptsController:dispose', 'disposed')
    }

    // Check if the config is enabled on config change, and toggle the builder
    private checkIsConfigEnabled(): void {
        const config = vscode.workspace.getConfiguration('cody')
        const newConfig = config.get('experimental.customPrompts') as boolean
        this.isEnabled = newConfig
        this.store.activate(newConfig)
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
            return this.tools.openFile(this.store.jsonFileUris[filePath])
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
        debug('CustomPromptsController:find:myPrompt', id, { verbose: myPrompt })
        this.myPromptInProgress = myPrompt
        this.lastUsedCommands.add(id)
        return myPrompt?.prompt
    }

    // get the list of recipe names to share with the webview to display
    public getRecipes(): [string, CodyPrompt][] {
        return this.store.getRecipes().filter(recipe => recipe[1].prompt !== 'seperator')
    }

    // Get the prompts and premade for client to use
    public async getMyPrompts(): Promise<MyPrompts> {
        const myPromptsConfig = await this.store.refresh()
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

    // Save the user prompts to the user json file
    public async save(
        id: string,
        prompt: CodyPrompt,
        deletePrompt = false,
        type: CodyPromptType = 'user'
    ): Promise<void> {
        if (deletePrompt) {
            this.myPromptsMap.delete(id)
        } else {
            this.myPromptsMap.set(id, prompt)
        }
        // filter prompt map to remove prompt with type workspace
        const filtered = new Map<string, CodyPrompt>()
        for (const [key, value] of this.myPromptsMap) {
            if (value.type === 'user') {
                filtered.set(key, value)
            }
        }
        // Add new prompt to the map
        filtered.set(id, prompt)
        // turn prompt map into json
        const jsonContext = { ...this.store.userPromptsJSON }
        jsonContext.prompts = Object.fromEntries(filtered)
        const jsonString = JSON.stringify(jsonContext)
        const rootDirPath = type === 'user' ? this.store.jsonFileUris.user : this.store.jsonFileUris.workspace
        if (!rootDirPath || !jsonString) {
            void vscode.window.showErrorMessage('Failed to save to cody.json file.')
            return
        }
        const isSaveMode = true
        await saveJSONFile(jsonString, rootDirPath, isSaveMode)
        await this.refresh()
    }

    // Get the prompts from cody.json file then build the map of prompts
    public async refresh(): Promise<void> {
        await this.saveLastUsedCommands()
        const { prompts } = await this.store.refresh()
        this.myPromptsMap = prompts
        this.default.groupCommands(prompts)
    }

    private async saveLastUsedCommands(): Promise<void> {
        // store the last 3 used recipes
        const lastUsedCommands = [...this.lastUsedCommands].slice(-3)
        if (lastUsedCommands.length > 0) {
            await this.localStorage.setLastUsedCommands(lastUsedCommands)
        }
        this.lastUsedCommands = new Set(lastUsedCommands)
    }

    // Clear the user prompts from the extension storage
    public async clear(type: CodyPromptType = 'user'): Promise<void> {
        const isUserType = type === 'user'
        // delete .vscode/cody.json for user recipe using the vs code api
        const uri = isUserType ? this.store.jsonFileUris.user : this.store.jsonFileUris.workspace
        if (this.store.promptSize[type] === 0 || !uri) {
            void vscode.window.showInformationMessage(
                'Fail: try deleting the .vscode/cody.json file in your repository or home directory manually.'
            )
            debug('CustomPromptsController:clear:error:', 'Failed to remove cody.json file for' + type)
        }
        await deleteFile(uri)
        await this.refresh()
    }

    // Add a new cody.json file to the user's workspace or home directory
    public async addJSONFile(type: CodyPromptType): Promise<void> {
        try {
            const extensionPath = this.context.extensionPath
            const isUserType = type === 'user'
            const configFileUri = isUserType ? this.store.jsonFileUris.user : this.store.jsonFileUris.workspace
            if (!configFileUri) {
                throw new Error('Please make sure you have a repository opened in your workspace.')
            }
            await createJSONFile(extensionPath, configFileUri, isUserType)
        } catch (error) {
            const errorMessage = 'Failed to create cody.json file: '
            void vscode.window.showErrorMessage(`${errorMessage} ${error}`)
            debug('CustomPromptsController:addJSONFile:create', 'failed', { verbose: error })
        }
    }

    // Menu with an option to add a new recipe via UI and save it to user's cody.json file
    public async menu(): Promise<void> {
        const promptSize = this.store.promptSize.user + this.store.promptSize.workspace
        const selectedOption = await showCustomPromptMenu()
        const selected = promptSize === 0 ? 'file' : selectedOption?.actionID
        if (!selectedOption || !selected) {
            return
        }
        debug('CustomPromptsController:customPrompts:menu', selected)
        if (selected === 'delete' || selected === 'file' || selected === 'open') {
            const fileType = await showRecipeTypeQuickPick(selected, this.store.promptSize)
            if (!fileType) {
                return
            }
            await this.fileTypeActionProcessor(selected, fileType)
        } else if (selected === 'add') {
            if (selectedOption?.recipeType === 'user') {
                await this.updateUserRecipeQuick()
            } else {
                const wsFileAction = this.store.promptSize.workspace === 0 ? 'file' : 'open'
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

    // Menu with a list of user recipes to run
    public async promptsQuickPicker(): Promise<void> {
        if (this.myPromptsMap.size === 0) {
            await this.menu()
            return
        }
        try {
            const lastUsedCommands = [...this.lastUsedCommands]
                ?.map(id => {
                    const recipe = this.myPromptsMap.get(id)
                    return recipe ? [id, recipe] : null
                })
                ?.reverse()
            const lastUsedCommandsList = [...lastUsedCommandsSeperator, ...lastUsedCommands] as [string, CodyPrompt][]
            // Get the list of prompts from the cody.json file
            const commandsFromStore = this.store.getRecipes()
            const promptList = lastUsedCommands.length
                ? [...lastUsedCommandsList, ...commandsFromStore]
                : commandsFromStore
            const promptItems = promptList
                ?.filter(recipe => recipe !== null && recipe?.[1]?.type !== 'default')
                .map(commandItem => {
                    const recipe = commandItem[1]
                    const description = recipe.slashCommand ? '/' + recipe.slashCommand : ''
                    return recipe.prompt === 'seperator'
                        ? {
                              kind: -1,
                              label: recipe.type,
                              detail: recipe.prompt,
                          }
                        : {
                              label: recipe.name || commandItem[0],
                              description,
                          }
                }) as vscode.QuickPickItem[]
            const seperator: vscode.QuickPickItem = { kind: -1, label: 'action' }
            const addOption: vscode.QuickPickItem = { label: 'New Custom Command...', alwaysShow: true }
            promptItems.push(seperator, addOption)
            // Show the list of prompts to the user using a quick pick
            const options = { title: 'Cody Custom Commands', placeHolder: 'Search recipe to run...' }
            const selectedPrompt = await vscode.window.showQuickPick([...promptItems], options)
            if (!selectedPrompt) {
                return
            }
            // Find the prompt based on the selected prompt name
            const promptTitle = selectedPrompt.label
            if (promptTitle === addOption.label) {
                await this.updateUserRecipeQuick()
                return
            }
            if (!promptTitle) {
                return
            }
            debug('CustomPromptsController:promptsQuickPicker:selectedPrompt', promptTitle)
            // Run the prompt
            await vscode.commands.executeCommand('cody.customPrompts.exec', promptTitle)
        } catch (error) {
            debug('CustomPromptsController:promptsQuickPicker', 'error', { verbose: error })
        }
    }

    // Get the prompt name and prompt description from the user using the input box
    // Add new recipe to user's .vscode/cody.json file
    private async updateUserRecipeQuick(): Promise<void> {
        const promptName = (await showPromptNameInput(this.myPromptsMap)) || null
        if (!promptName) {
            return
        }
        const newPrompt = await createNewPrompt(promptName)
        if (!newPrompt) {
            return
        }
        // Save the prompt to the current Map and Extension storage
        this.myPromptsMap.set(promptName, newPrompt)
        await this.save(promptName, newPrompt)
        debug('CustomPromptsController:updateUserRecipeQuick:newPrompt:', 'saved', { verbose: newPrompt })
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

    public async quickChatInput(): Promise<void> {
        const humanInput = await vscode.window.showInputBox({
            prompt: 'Ask Cody a question...',
            placeHolder: 'ex. What is a class in Typescript?',
            validateInput: (input: string) => (input ? null : 'Please enter a question.'),
        })
        if (humanInput) {
            await vscode.commands.executeCommand('cody.action.chat', humanInput)
        }
    }
}
