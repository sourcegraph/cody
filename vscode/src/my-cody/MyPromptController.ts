import * as vscode from 'vscode'

import { Preamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import { defaultCodyPromptContext } from '@sourcegraph/cody-shared/src/chat/recipes/my-prompt'

import { isInternalUser } from '../chat/protocol'

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
    private promptInProgress: string | null = null
    private dev = false
    public wsFileWatcher: vscode.FileSystemWatcher | null = null
    public userFileWatcher: vscode.FileSystemWatcher | null = null

    constructor(
        private debug: (filterLabel: string, text: string, ...args: unknown[]) => void,
        private context: vscode.ExtensionContext,
        endpoint: string | null
    ) {
        this.debug('MyPromptsProvider', 'Initialized')
        this.isDev(endpoint)

        this.tools = new MyToolsProvider(context)
        const user = this.tools.getUserInfo()
        this.builder = new CustomRecipesBuilder(user?.workspaceRoot, user.homeDir)
        // Create file watchers for cody.json files used for building custom recipes
        if (this.dev) {
            this.wsFileWatcher = createFileWatch(user?.workspaceRoot)
            this.userFileWatcher = createFileWatch(user?.homeDir)
        }
        this.refresh().catch(error => console.error(error))
    }

    private isDev(uri: string | null): boolean {
        this.dev = isInternalUser(uri || '')
        return this.dev
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
        this.promptInProgress = myPrompt?.prompt || ''
        return this.promptInProgress
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
        // NOTE: Internal s2 users only
        if (!this.dev) {
            return
        }
        const userJSON = await this.builder.get()
        this.myPromptStore = userJSON.prompts
        this.myPremade = userJSON.premade
        this.myStarter = userJSON.starter
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
            // Get the prompt name and prompt description from the user using the input box
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
