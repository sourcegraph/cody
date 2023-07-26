import * as vscode from 'vscode'

import { Preamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import { newPromptMixin, PromptMixin } from '@sourcegraph/cody-shared/src/prompt/prompt-mixin'

import { CodyPrompt, CodyPromptType, CustomRecipesFileName, MyPrompts, MyPromptsJSON } from './const'
import { constructFileUri } from './helper'

/**
 * The CustomRecipesStore class is responsible for loading and building the custom prompts from the cody.json files.
 * It has methods to get the prompts from the file system, parse the JSON, and build the prompts map.
 */
export class CustomRecipesStore {
    public myPremade: Preamble | undefined = undefined
    public myPromptsMap = new Map<string, CodyPrompt>()
    public defaultPromptsMap = new Map<string, CodyPrompt>()
    public myStarter = ''

    public userPromptsJSON: MyPromptsJSON | null = null

    public promptSize = promptSizeInit

    public jsonFileUris: { user?: vscode.Uri; workspace?: vscode.Uri }

    public codebase: string | null = null

    constructor(
        private isActive: boolean,
        private workspaceRoot?: string,
        private homeDir?: string
    ) {
        this.jsonFileUris = {
            user: constructFileUri(CustomRecipesFileName, homeDir),
            workspace: constructFileUri(CustomRecipesFileName, workspaceRoot),
        }
    }

    private async init(): Promise<void> {
        if (this.promptSize.default > 0) {
            return
        }
        const extension = vscode.extensions.getExtension('sourcegraph.cody-ai')
        // get the premade prompts from the extension path resources directory
        if (!extension?.extensionUri) {
            return
        }
        const defaultRecipesJSONUri = vscode.Uri.joinPath(
            extension?.extensionUri,
            'resources',
            'samples',
            'default-recipes.json'
        )
        try {
            const bytes = await vscode.workspace.fs.readFile(defaultRecipesJSONUri)
            const decoded = new TextDecoder('utf-8').decode(bytes)
            const json = JSON.parse(decoded) as MyPromptsJSON
            const prompts = json.recipes
            this.defaultPromptsMap.set('default', { prompt: 'seperator', type: 'default' })
            for (const key in prompts) {
                if (Object.prototype.hasOwnProperty.call(prompts, key)) {
                    const prompt = prompts[key]
                    prompt.type = 'default'
                    this.defaultPromptsMap.set(key, prompt)
                }
            }
        } catch {
            return
        }
    }

    public activate(state: boolean): void {
        if (this.isActive && !state) {
            this.dispose()
        }
        this.isActive = state
    }

    // Get the formatted context from the json config file
    public async get(): Promise<MyPrompts> {
        await this.init()
        if (!this.isActive) {
            return { prompts: this.myPromptsMap, premade: this.myPremade, starter: this.myStarter }
        }
        // reset map and set
        this.myPromptsMap = new Map<string, CodyPrompt>()
        this.promptSize = { ...promptSizeInit }
        this.promptSize.default = this.defaultPromptsMap.size
        // user prompts
        if (this.homeDir) {
            const recipeType = 'user'
            const userPrompts = await this.getPromptsFromFileSystem(recipeType)
            this.myPromptsMap.set(recipeType, { prompt: 'seperator', type: recipeType })
            this.build(userPrompts, recipeType)
        }
        // workspace prompts
        if (this.workspaceRoot) {
            const recipeType = 'workspace'
            const wsPrompts = await this.getPromptsFromFileSystem(recipeType)
            this.myPromptsMap.set(recipeType, { prompt: 'seperator', type: recipeType })
            this.build(wsPrompts, recipeType)
        }
        this.myPromptsMap = new Map([...this.myPromptsMap, ...this.defaultPromptsMap])
        return { prompts: this.myPromptsMap, premade: this.myPremade, starter: this.myStarter }
    }

    // Return myPromptsMap as an array with keys as the id
    public getRecipes(): [string, CodyPrompt][] {
        return [...this.myPromptsMap]
    }

    // Build the map of prompts from the json string
    public build(content: string | null, type: CodyPromptType): Map<string, CodyPrompt> | null {
        if (!content) {
            return null
        }
        const json = JSON.parse(content) as MyPromptsJSON
        const prompts = json.recipes
        for (const key in prompts) {
            if (Object.prototype.hasOwnProperty.call(prompts, key)) {
                const prompt = prompts[key]
                prompt.name = key
                prompt.type = type
                this.myPromptsMap.set(key, prompt)
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
        this.promptSize[type] = this.myPromptsMap.size - 1
        return this.myPromptsMap
    }

    // Get the context of the json file from the file system
    private async getPromptsFromFileSystem(type: CodyPromptType): Promise<string | null> {
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

    // Reset the class
    public dispose(): void {
        this.isActive = false
        this.myPromptsMap = new Map<string, CodyPrompt>()
        this.promptSize = { ...promptSizeInit }
        this.myPremade = undefined
        this.myStarter = ''
        this.userPromptsJSON = null
        this.codebase = null
    }
}

const promptSizeInit = {
    user: 0,
    workspace: 0,
    default: 0,
    'last used': 0,
}
