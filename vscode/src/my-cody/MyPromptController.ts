import * as vscode from 'vscode'

import { defaultCodyPromptContext } from '@sourcegraph/cody-shared/src/chat/recipes/my-prompt'
import { VsCodeMyPromptController } from '@sourcegraph/cody-shared/src/editor'

import { debug } from '../log'
import { LocalStorage } from '../services/LocalStorageProvider'

import { CodyPrompt, CodyPromptType, MyPrompts } from './const'
import {
    createNewPrompt,
    showCustomRecipeMenu,
    showPromptNameInput,
    showRecipeTypeQuickPick,
    showRemoveConfirmationInput,
} from './CustomRecipesMenus'
import { CustomRecipesStore } from './CustomRecipesStore'
import {
    constructFileUri,
    createFileWatchers,
    createJSONFile,
    deleteFile,
    lastUsedRecipesSeperator,
    saveJSONFile,
} from './helper'
import { MyToolsProvider } from './MyToolsProvider'

/**
 * Utilizes CustomRecipesStore to get the built prompt data
 * Provides additional prompt management and execution logic
 * NOTE: Dogfooding - Internal s2 users only
 */
export class MyPromptController implements VsCodeMyPromptController {
    private tools: MyToolsProvider
    private store: CustomRecipesStore

    private myPromptsMap = new Map<string, CodyPrompt>()

    private lastUsedRecipes = new Set<string>()
    private myPromptInProgress: CodyPrompt | null = null

    private webViewMessenger: (() => Promise<void>) | null = null
    public wsFileWatcher: vscode.FileSystemWatcher | null = null
    public userFileWatcher: vscode.FileSystemWatcher | null = null

    constructor(
        private context: vscode.ExtensionContext,
        private isEnabled: boolean,
        private localStorage: LocalStorage
    ) {
        this.tools = new MyToolsProvider(context)
        const user = this.tools.getUserInfo()
        this.store = new CustomRecipesStore(isEnabled, user?.workspaceRoot, user.homeDir)
        this.store.activate(this.isEnabled)
        this.watcherInit()
        const lastUsedRecipes = this.localStorage.getLastUsedRecipes()
        if (lastUsedRecipes) {
            this.lastUsedRecipes = new Set(lastUsedRecipes)
        }
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

    // Create file watchers for cody.json files used for building custom recipes
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
        debug('MyPromptController:watcherInit', 'watchers created')
    }

    // dispose and reset the controller and builder
    public dispose(): void {
        this.isEnabled = false
        this.store.dispose()
        this.myPromptInProgress = null
        this.myPromptsMap = new Map<string, CodyPrompt>()
        this.wsFileWatcher?.dispose()
        this.userFileWatcher?.dispose()
        debug('MyPromptController:dispose', 'disposed')
    }

    // Check if the config is enabled on config change, and toggle the builder
    private checkIsConfigEnabled(): void {
        const config = vscode.workspace.getConfiguration('cody')
        const newConfig = config.get('experimental.customRecipes') as boolean
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
        switch (type) {
            case 'prompt':
                return id ? this.myPromptsMap.get(id)?.prompt || null : null
            case 'context':
                return JSON.stringify(this.myPromptInProgress?.context || { ...defaultCodyPromptContext })
            case 'codebase':
                return this.myPromptInProgress?.context?.codebase ? 'codebase' : null
            case 'output':
            case 'command':
                // return the terminal output from the command for the prompt if any
                return this.getCommandOutput()
            default:
                return null
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
    public find(id: string): string {
        const myPrompt = this.myPromptsMap.get(id)
        if (!myPrompt) {
            return ''
        }
        debug('MyPromptController:find:myPrompt', id, { verbose: myPrompt })
        this.myPromptInProgress = myPrompt
        this.lastUsedRecipes.add(id)
        return myPrompt?.prompt
    }

    // Set the codebase for the builder to build the prompt
    public setCodebase(codebase?: string): void {
        if (this.store.codebase === codebase) {
            return
        }
        this.store.codebase = codebase || null
    }

    // get the list of recipe names to share with the webview to display
    public getRecipes(): [string, CodyPrompt][] {
        return this.store.getRecipes().filter(recipe => recipe[1].prompt !== 'seperator')
    }

    // Get the prompts and premade for client to use
    public async getMyPrompts(): Promise<MyPrompts> {
        const myPromptsConfig = await this.store.get()
        return myPromptsConfig
    }

    public async getCommandOutput(): Promise<string | null> {
        const fullCommand = this.myPromptInProgress?.context?.command
        if (!this.myPromptInProgress || !fullCommand) {
            return null
        }
        const output = await this.tools.exeCommand(fullCommand)
        return output || null
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
        jsonContext.recipes = Object.fromEntries(filtered)
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
        await this.saveLastUsedRecipes()
        const { prompts } = await this.store.get()
        this.myPromptsMap = prompts
    }

    private async saveLastUsedRecipes(): Promise<void> {
        // store the last 3 used recipes
        const lastUsedRecipes = [...this.lastUsedRecipes].slice(-3)
        if (lastUsedRecipes.length > 0) {
            await this.localStorage.setLastUsedRecipes(lastUsedRecipes)
        }
        this.lastUsedRecipes = new Set(lastUsedRecipes)
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
            debug('MyPromptController:clear:error:', 'Failed to remove cody.json file for' + type)
        }
        await deleteFile(uri)
        await this.refresh()
    }

    // Add a new cody.json file to the user's workspace or home directory
    public async addJSONFile(type: CodyPromptType): Promise<void> {
        const extensionPath = this.context.extensionPath
        const isUserType = type === 'user'
        const configFileUri = isUserType ? this.store.jsonFileUris.user : this.store.jsonFileUris.workspace
        if (!configFileUri) {
            debug('MyPromptController:addJSONFile:create', 'failed')
            void vscode.window.showErrorMessage(
                'Failed to create cody.json file. Please make sure you have a repository opened in your workspace.'
            )
            return
        }
        await createJSONFile(extensionPath, configFileUri, isUserType)
    }

    // Menu with an option to add a new recipe via UI and save it to user's cody.json file
    public async menu(): Promise<void> {
        const promptSize = this.store.promptSize.user + this.store.promptSize.workspace
        const selectedOption = await showCustomRecipeMenu()
        const selected = promptSize === 0 ? 'file' : selectedOption?.actionID
        if (!selectedOption || !selected) {
            return
        }
        debug('MyPromptController:customRecipes:menu', selected)
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
            await this.quickRecipePicker()
        }
    }

    // Menu with a list of user recipes to run
    public async quickRecipePicker(): Promise<void> {
        try {
            const lastUsedRecipes = [...this.lastUsedRecipes]?.map(id => {
                const recipe = this.myPromptsMap.get(id)
                return recipe ? [id, recipe] : null
            })
            const lastUsedRecipesList = [...lastUsedRecipesSeperator, ...lastUsedRecipes] as [string, CodyPrompt][]
            // Get the list of prompts from the cody.json file
            const recipesFromStore = this.store.getRecipes()
            const promptList = lastUsedRecipes.length ? [...lastUsedRecipesList, ...recipesFromStore] : recipesFromStore
            const promptItems = promptList
                ?.filter(recipe => recipe !== null)
                .map(recipeItem => {
                    const recipe = recipeItem[1]
                    return recipe.prompt === 'seperator'
                        ? {
                              kind: -1,
                              label: recipe.type,
                              detail: recipe.prompt,
                          }
                        : {
                              detail: recipe.prompt,
                              label: recipeItem[0],
                              description: recipe.type,
                          }
                }) as vscode.QuickPickItem[]
            const seperator: vscode.QuickPickItem = { kind: -1, label: 'action' }
            const addOption: vscode.QuickPickItem = { label: 'Create a New User Recipe', alwaysShow: true }
            promptItems.push(seperator, addOption)
            // Show the list of prompts to the user using a quick pick
            const options = { title: 'Cody: My Recipes', placeHolder: 'Search recipe to run...' }
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
            debug('MyPromptController:quickRecipePicker:selectedPrompt', promptTitle)
            // Run the prompt
            await vscode.commands.executeCommand('cody.customRecipes.exec', promptTitle)
        } catch (error) {
            debug('MyPromptController:quickRecipePicker', 'error', { verbose: error })
        }
    }

    // Get the prompt name and prompt description from the user using the input box
    // Add new recipe to user's .vscode/cody.json file
    private async updateUserRecipeQuick(): Promise<void> {
        const promptName = (await showPromptNameInput(this.myPromptsMap)) ?? ''
        const newPrompt = await createNewPrompt(promptName)
        if (!promptName || !newPrompt) {
            return
        }
        // Save the prompt to the current Map and Extension storage
        this.myPromptsMap.set(promptName, newPrompt)
        await this.save(promptName, newPrompt)
        debug('MyPromptController:updateUserRecipeQuick:newPrompt:', 'saved', { verbose: newPrompt })
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
