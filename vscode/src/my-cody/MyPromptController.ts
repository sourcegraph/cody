import * as vscode from 'vscode'

import { Preamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import { CodyPromptContext, defaultCodyPromptContext } from '@sourcegraph/cody-shared/src/chat/recipes/my-prompt'
import { newPromptMixin, PromptMixin } from '@sourcegraph/cody-shared/src/prompt/prompt-mixin'

import { isInternalUser } from '../chat/protocol'

import {
    createFileWatch,
    createJSONFile,
    createNewPrompt,
    makeFileUri,
    prompt_creation_title,
    saveJSONFile,
} from './helper'
import { MyToolsProvider } from './MyToolsProvider'

interface MyPromptsJSON {
    // A set of reusable prompts where instructions and context can be configured.
    recipes: { [id: string]: CodyPrompt }
    // Premade are a set of prompts that are added to the start of every new conversation.
    // This is where we define the "persona" and "rules" to share with LLM
    premade?: CodyPromptPremade
    // Starter is added to the start of every human input sent to Cody.
    starter?: string
}

export interface CodyPrompt {
    prompt: string
    command?: string
    args?: string[]
    context?: CodyPromptContext
    type?: CodyPromptType
}

interface CodyPromptPremade {
    actions: string
    rules: string
    answer: string
}

type CodyPromptType = 'workspace' | 'user'

interface MyPrompts {
    prompts: Map<string, CodyPrompt>
    premade?: Preamble
    starter: string
}

const MY_CODY_PROMPTS_KEY = 'my-cody-prompts'

// NOTE: Dogfooding - Internal s2 users only
export class MyPromptController {
    private myPremade: Preamble | undefined = undefined
    private myStarter = ''
    private myPromptStore = new Map<string, CodyPrompt>()

    private tools: MyToolsProvider
    private builder: MyRecipesBuilder

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
        this.builder = new MyRecipesBuilder(user?.workspaceRoot, user.homeDir)
        // Create file watchers for cody.json files used for building custom recipes
        if (this.dev) {
            this.wsFileWatcher = createFileWatch(user?.workspaceRoot)
            this.userFileWatcher = createFileWatch(user?.homeDir)
            void this.context.globalState.update(MY_CODY_PROMPTS_KEY, null)
        }
        this.refresh().catch(error => console.error(error))
    }

    private isDev(uri: string | null): boolean {
        this.dev = isInternalUser(uri || '')
        return this.dev
    }

    // getter for the promptInProgress
    public get(type?: string): string | null {
        if (type === 'context') {
            const contextConfig = this.myPromptInProgress?.context || { ...defaultCodyPromptContext }
            return JSON.stringify(contextConfig)
        }
        if (type === 'codebase') {
            return this.myPromptInProgress?.context?.codebase ? 'codebase' : null
        }
        // return the terminal output from the last command run
        return this.getCommandOutput()
    }

    // Open workspace file in editor
    // TODO (bee) move this to MyToolsProvider
    public async open(fsPath: string): Promise<void> {
        const uri =
            fsPath === 'user'
                ? this.builder.jsonFileUris.user
                : makeFileUri(fsPath, this.tools.getUserInfo()?.workspaceRoot)
        await vscode.commands.executeCommand('vscode.open', uri)
    }

    // Find the prompt based on the id
    public find(id: string): string {
        const myPrompt = this.myPromptStore.get(id)
        this.myPromptInProgress = myPrompt || null
        this.promptInProgress = myPrompt?.prompt || ''
        return this.promptInProgress
    }

    public run(command: string, args?: string[]): string | null {
        // Expand the ~ to the user's home directory
        const homeDir = this.tools.getUserInfo()?.homeDir + '/' || ''
        // Replace the ~/ with the home directory if arg starts with ~/
        const filteredArgs = args?.map(arg => arg.replace(/^~\//, homeDir))
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
    public async clear(): Promise<void> {
        if (!this.builder.userPromptsSize) {
            void vscode.window.showInformationMessage(
                'No User Recipes to remove. If you want to remove Workspace Recipes, please remove the .vscode/cody.json file from your repository.'
            )
        }
        await this.deleteUserJSONFile()
    }

    private async deleteUserJSONFile(): Promise<void> {
        // delete .vscode/cody.json for user recipe using the vs code api
        const homeDir = this.tools.getUserInfo()?.homeDir
        const userJSONFilePath = homeDir + '/.vscode/cody.json'
        const userJSONFileUri = vscode.Uri.file(userJSONFilePath)
        await vscode.workspace.fs.delete(userJSONFileUri)
    }

    public async addJSONFile(type: string): Promise<void> {
        const extensionPath = this.context.extensionPath
        const isUserType = type === 'user'
        const rootDirPath = isUserType ? this.tools.getUserInfo()?.homeDir : this.tools.getUserInfo()?.workspaceRoot
        if (!rootDirPath) {
            void vscode.window.showErrorMessage('Failed to create cody.json file.')
            return
        }
        await createJSONFile(extensionPath, rootDirPath, isUserType)
    }

    // Add a new recipe via UI and save it to extension storage
    public async add(): Promise<void> {
        // Get the prompt name and prompt description from the user using the input box
        const promptName = await vscode.window.showInputBox({
            title: prompt_creation_title,
            prompt: 'Enter an unique name for the new recipe.',
            placeHolder: 'e,g. Vulnerability Scanner',
            validateInput: (input: string) => {
                if (!input || input.split(' ').length < 2) {
                    return 'Please enter a valid name for the recipe. A recipe name should be at least two words.'
                }
                if (this.myPromptStore.has(input)) {
                    return 'A recipe with the same name already exists. Please enter a different name.'
                }
                return
            },
        })
        const newPrompt = await createNewPrompt(promptName)
        if (!promptName || !newPrompt) {
            return
        }
        // Save the prompt to the current Map and Extension storage
        this.myPromptStore.set(promptName, newPrompt)
        await this.save(promptName, newPrompt)
    }
}

class MyRecipesBuilder {
    public myPremade: Preamble | undefined = undefined
    public myPromptsMap = new Map<string, CodyPrompt>()
    public myStarter = ''
    public idSet = new Set<string>()

    public userPromptsJSON: MyPromptsJSON | null = null
    public userPromptsSize = 0

    public jsonFileUris: { user: vscode.Uri | null; workspace: vscode.Uri | null }

    public codebase: string | null = null

    constructor(
        private workspaceRoot?: string,
        private homeDir?: string
    ) {
        this.jsonFileUris = {
            user: makeFileUri('.vscode/cody.json', homeDir),
            workspace: makeFileUri('.vscode/cody.json', workspaceRoot),
        }
    }

    public async get(): Promise<MyPrompts> {
        // reset map and set
        this.myPromptsMap = new Map<string, CodyPrompt>()
        this.idSet = new Set<string>()
        // user prompts
        if (this.homeDir) {
            const userPrompts = await this.getPromptsFromFileSystem('user')
            const userPromptsMap = this.build(userPrompts, 'user')
            this.userPromptsSize = userPromptsMap?.size || 0
        }
        // workspace prompts
        if (this.workspaceRoot) {
            const wsPrompts = await this.getPromptsFromFileSystem('workspace')
            this.build(wsPrompts, 'workspace')
        }
        return { prompts: this.myPromptsMap, premade: this.myPremade, starter: this.myStarter }
    }

    public getIDs(): string[] {
        return [...this.idSet]
    }

    public build(content: string | null, type: CodyPromptType): Map<string, CodyPrompt> | null {
        if (!content) {
            return null
        }
        const json = JSON.parse(content) as MyPromptsJSON
        const prompts = json.recipes
        for (const key in prompts) {
            if (Object.prototype.hasOwnProperty.call(prompts, key)) {
                const prompt = prompts[key]
                prompt.type = type
                this.myPromptsMap.set(key, prompt)
                this.idSet.add(key)
            }
        }
        this.myPremade = json.premade
        if (json.starter && json?.starter !== this.myStarter) {
            PromptMixin.addCustom(newPromptMixin(json.starter))
            this.myStarter = json.starter
        }
        if (type === 'user') {
            this.userPromptsJSON = json
        }
        return this.myPromptsMap
    }

    private async getPromptsFromFileSystem(type: 'user' | 'workspace'): Promise<string | null> {
        const codyJsonFilePath = type === 'user' ? this.jsonFileUris.user : this.jsonFileUris.workspace
        if (!codyJsonFilePath) {
            return null
        }
        try {
            const bytes = await vscode.workspace.fs.readFile(codyJsonFilePath)
            const decoded = new TextDecoder('utf-8').decode(bytes) || null
            return decoded
        } catch {
            return null
        }
    }
}
