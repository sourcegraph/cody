import * as vscode from 'vscode'

import { Preamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import { defaultCodyPromptContext } from '@sourcegraph/cody-shared/src/chat/recipes/my-prompt'

import { CustomRecipesBuilder } from './CustomRecipesBuilder'
import { constructFileUri, createFileWatch, createJSONFile, deleteFile, saveJSONFile } from './helper'
import {
    createNewPrompt,
    showCustomRecipeMenu,
    showPromptNameInput,
    showRecipeTypeQuickPick,
    showRemoveConfirmationInput,
} from './InputMenu'
import { MyToolsProvider } from './MyToolsProvider'
import { CodyPrompt, CodyPromptType, MyPrompts } from './types'

/**
 * Utilizes CustomRecipesBuilder to get the built prompt data
 * Provides additional prompt management and execution logic
 * NOTE: Dogfooding - Internal s2 users only
 */
export class MyPromptController {
    private myPremade: Preamble | undefined = undefined
    private myStarter = ''
    private myPromptStore = new Map<string, CodyPrompt>()

    private tools: MyToolsProvider
    private builder: CustomRecipesBuilder

    private myPromptInProgress: CodyPrompt | null = null

    private webViewMessenger: (() => Promise<void>) | null = null
    public wsFileWatcher: vscode.FileSystemWatcher | null = null
    public userFileWatcher: vscode.FileSystemWatcher | null = null

    constructor(
        private debug: (filterLabel: string, text: string, ...args: unknown[]) => void,
        private context: vscode.ExtensionContext,
        private isEnabled: boolean
    ) {
        this.tools = new MyToolsProvider(context)
        const user = this.tools.getUserInfo()
        this.builder = new CustomRecipesBuilder(isEnabled, user?.workspaceRoot, user.homeDir)
        this.builder.activate(this.isEnabled)
        // Toggle on Config Change
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('cody')) {
                this.checkIsConfigEnabled()
            }
        })
        this.debug('MyPromptsProvider', 'Initialized')
    }

    public setMessager(messenger: () => Promise<void>): void {
        if (this.webViewMessenger) {
            return
        }
        this.webViewMessenger = messenger
    }

    // Create file watchers for cody.json files used for building custom recipes
    private watcherInit(): void {
        const user = this.tools.getUserInfo()
        this.wsFileWatcher = createFileWatch(user?.workspaceRoot)
        this.userFileWatcher = createFileWatch(user?.homeDir)
        this.wsFileWatcher?.onDidChange(() => this.webViewMessenger?.())
        this.userFileWatcher?.onDidChange(() => this.webViewMessenger?.())
        return
    }

    public dispose(): void {
        this.isEnabled = false
        this.builder.dispose()
        this.myPromptInProgress = null
        this.myPremade = undefined
        this.myStarter = ''
        this.myPromptStore = new Map<string, CodyPrompt>()
        this.wsFileWatcher?.dispose()
        this.userFileWatcher?.dispose()
    }

    private checkIsConfigEnabled(): void {
        const config = vscode.workspace.getConfiguration('cody')
        const newConfig = config.get('experimental.customRecipes') as boolean
        this.isEnabled = newConfig
        this.builder.activate(newConfig)
        if (newConfig && this.isEnabled) {
            this.watcherInit()
        }
        if (!newConfig) {
            this.dispose()
        }
    }

    // getter for the promptInProgress
    public get(type?: string): string | null {
        switch (type) {
            case 'context':
                return JSON.stringify(this.myPromptInProgress?.context || { ...defaultCodyPromptContext })
            case 'codebase':
                return this.myPromptInProgress?.context?.codebase ? 'codebase' : null
            default:
                // return the terminal output from the last command run
                return this.getCommandOutput()
        }
    }

    // Open workspace file in editor
    public async open(filePath: string): Promise<void> {
        if (filePath === 'user' || filePath === 'workspace') {
            return this.tools.openFile(this.builder.jsonFileUris[filePath])
        }
        const fileUri = constructFileUri(filePath, this.tools.getUserInfo()?.workspaceRoot)
        return vscode.commands.executeCommand('vscode.open', fileUri)
    }

    // Find the prompt based on the id
    public find(id: string): string {
        const myPrompt = this.myPromptStore.get(id)
        this.myPromptInProgress = myPrompt || null
        return myPrompt?.prompt || ''
    }

    public run(command: string, args?: string[]): string | null {
        if (!args || args.length === 0) {
            return this.tools.runCommand(command)
        }
        // Expand the ~ to the user's home directory
        const homeDir = this.tools.getUserInfo()?.homeDir + '/' || ''
        // Replace the ~/ with the home directory if arg starts with ~/
        const filteredArgs = args.map(arg => arg.replace(/^~\//, homeDir))
        return this.tools.runCommand(command, filteredArgs)
    }

    public setCodebase(codebase?: string): void {
        this.builder.codebase = codebase || null
    }

    // get the list of recipe names to share with the webview to display
    // we will then use the selected recipe name to get the prompt during the recipe execution step
    public getPromptList(): string[] {
        return this.builder.getIDs()
    }

    // Get the prompts and premade for client to use
    public getMyPrompts(): MyPrompts {
        return { prompts: this.myPromptStore, premade: this.myPremade, starter: this.myStarter }
    }

    public getCommandOutput(): string | null {
        if (!this.myPromptInProgress) {
            return null
        }
        const { command, args } = this.myPromptInProgress
        if (!command) {
            return null
        }
        return this.run(command, args)
    }

    // Save the user prompts to the extension storage
    public async save(id: string, prompt: CodyPrompt, deletePrompt = false): Promise<void> {
        if (deletePrompt) {
            this.myPromptStore.delete(id)
        } else {
            this.myPromptStore.set(id, prompt)
        }
        // filter prompt map to remove prompt with type workspace
        const filtered = new Map<string, CodyPrompt>()
        for (const [key, value] of this.myPromptStore) {
            if (value.type !== 'workspace') {
                filtered.set(key, value)
            }
        }
        // Add new prompt to the map
        filtered.set(id, prompt)
        // turn prompt map into json
        const jsonContext = { ...this.builder.userPromptsJSON }
        jsonContext.recipes = Object.fromEntries(filtered)
        const jsonString = JSON.stringify(jsonContext)
        const rootDirPath = this.tools.getUserInfo()?.homeDir
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
        const { prompts, premade, starter } = await this.builder.get()
        this.myPromptStore = prompts
        this.myPremade = premade
        this.myStarter = starter
        return
    }

    // Clear the user prompts from the extension storage
    public async clear(type: CodyPromptType = 'user'): Promise<void> {
        const isUserType = type === 'user'
        // delete .vscode/cody.json for user recipe using the vs code api
        const uri = isUserType ? this.builder.jsonFileUris.user : this.builder.jsonFileUris.workspace
        if (this.builder.promptSize[type] === 0 || !uri) {
            void vscode.window.showInformationMessage(
                'Recipes file not found. Try removing the .vscode/cody.json file in your repository or home directory for User Recipes manually.'
            )
        }
        await deleteFile(uri)
        await this.refresh()
    }

    public async addJSONFile(type: CodyPromptType): Promise<void> {
        const extensionPath = this.context.extensionPath
        const isUserType = type === 'user'
        const rootDirPath = isUserType ? this.tools.getUserInfo()?.homeDir : this.tools.getUserInfo()?.workspaceRoot
        if (!rootDirPath) {
            void vscode.window.showErrorMessage('Failed to create cody.json file.')
            return
        }
        await createJSONFile(extensionPath, rootDirPath, isUserType)
    }

    // Menu with an option to add a new recipe via UI and save it to user's cody.json file
    public async menu(): Promise<void> {
        const selected = await showCustomRecipeMenu()
        if (!selected) {
            return
        }
        if (selected === 'delete' || selected === 'file' || selected === 'open') {
            const fileType = await showRecipeTypeQuickPick(selected, this.builder.promptSize)
            if (!fileType) {
                return
            }
            await this.fileTypeActions(selected, fileType)
        } else if (selected === 'add') {
            await this.addUserRecipeQuick()
        } else if (selected === 'list') {
            await this.quickRecipe()
        }
    }

    public async quickRecipe(): Promise<void> {
        // Get the list of prompts from the cody.json file
        const promptList = this.getPromptList() || []
        const promptItems = promptList.map(prompt => ({
            detail: this.myPromptStore.get(prompt)?.prompt,
            label: prompt,
        }))
        const seperator = { kind: -1, label: 'action', detail: '' }
        const addOption = { label: 'Create a New User Recipe', detail: '' }
        promptItems.push(seperator, addOption)
        // Show the list of prompts to the user using a quick pick
        const options = { title: 'My Custom Recipes', placeHolder: 'Select a recipe to run...' }
        const selectedPrompt = await vscode.window.showQuickPick(promptItems, options)
        if (!selectedPrompt) {
            return
        }
        // Find the prompt based on the selected prompt name
        const promptTitle = selectedPrompt.label
        if (promptTitle === addOption.label) {
            await this.addUserRecipeQuick()
            return
        }
        if (!promptTitle) {
            return
        }
        // Run the prompt
        await vscode.commands.executeCommand('cody.customRecipes.exec', promptTitle)
    }

    // Get the prompt name and prompt description from the user using the input box
    // Add new recipe to user's .vscode/cody.json file
    private async addUserRecipeQuick(): Promise<void> {
        const promptName = await showPromptNameInput(this.myPromptStore)
        if (!promptName) {
            return
        }
        const newPrompt = await createNewPrompt(promptName)
        if (!newPrompt) {
            return
        }
        // Save the prompt to the current Map and Extension storage
        this.myPromptStore.set(promptName, newPrompt)
        await this.save(promptName, newPrompt)
    }

    private async fileTypeActions(action: string, fileType: CodyPromptType): Promise<void> {
        if (action === 'delete') {
            const confirmRemove = await showRemoveConfirmationInput()
            if (confirmRemove !== 'Yes') {
                return
            }
            await this.clear(fileType)
            return
        }
        if (action === 'file') {
            await this.addJSONFile(fileType)
            return
        }
        if (action === 'open') {
            await this.open(fileType)
            return
        }
    }
}
