import * as vscode from 'vscode'

import { Preamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import { newPromptMixin, PromptMixin } from '@sourcegraph/cody-shared/src/prompt/prompt-mixin'

import {
    CodyPrompt,
    CodyPromptType,
    CustomRecipesConfigFileName,
    MyPrompts,
    MyPromptsJSON,
    promptSizeInit,
} from './const'
import { constructFileUri, getFileContentText } from './helper'

/**
 * The CustomRecipesStore class is responsible for loading and building the custom prompts from the cody.json files.
 * It has methods to get the prompts from the file system, parse the JSON, and build the prompts map.
 */
export class CustomRecipesStore {
    public myPremade: Preamble | undefined = undefined
    public myPromptsMap = new Map<string, CodyPrompt>()
    public myStarter = ''

    public userPromptsJSON: MyPromptsJSON | null = null

    public promptSize = promptSizeInit
    public jsonFileUris: { user?: vscode.Uri; workspace?: vscode.Uri; default?: vscode.Uri }

    constructor(
        private isActive: boolean,
        extensionPath: vscode.Uri,
        private workspaceRoot?: string,
        private homeDir?: string
    ) {
        this.jsonFileUris = {
            user: constructFileUri(CustomRecipesConfigFileName, homeDir),
            workspace: constructFileUri(CustomRecipesConfigFileName, workspaceRoot),
            default: vscode.Uri.joinPath(extensionPath, 'resources', 'samples', 'default-recipes.json'),
        }
        this.activate(isActive)
    }

    public activate(state: boolean): void {
        if (this.isActive && !state) {
            this.dispose()
        }
        this.isActive = state
    }

    // Get the formatted context from the json config file
    public async refresh(): Promise<MyPrompts> {
        if (!this.isActive) {
            return { prompts: this.myPromptsMap, premade: this.myPremade, starter: this.myStarter }
        }
        // reset map and set
        this.myPromptsMap = new Map<string, CodyPrompt>()
        this.promptSize = { ...promptSizeInit }
        // user prompts
        if (this.homeDir) {
            await this.build('user')
        }
        // workspace prompts
        if (this.workspaceRoot) {
            await this.build('workspace')
        }
        await this.buildDefaultRecipes()
        return { prompts: this.myPromptsMap, premade: this.myPremade, starter: this.myStarter }
    }

    private async buildDefaultRecipes(): Promise<void> {
        if (this.promptSize.default > 0) {
            return
        }
        await this.build('default')
    }

    // Return myPromptsMap as an array with keys as the id
    public getRecipes(): [string, CodyPrompt][] {
        return [...this.myPromptsMap]
    }

    // Build the map of prompts from the json string
    public async build(type: CodyPromptType): Promise<Map<string, CodyPrompt> | null> {
        const content = await this.getPromptsFromFileSystem(type)
        if (!content) {
            return null
        }
        this.myPromptsMap.set(type, { prompt: 'seperator', type })
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
        // avoid duplicate starter prompts
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
        if (type === 'last used') {
            return null
        }
        const codyJsonFilePathUri = this.jsonFileUris[type]
        return codyJsonFilePathUri ? getFileContentText(codyJsonFilePathUri) : null
    }

    // Reset the class
    public dispose(): void {
        this.isActive = false
        this.myPromptsMap = new Map<string, CodyPrompt>()
        this.promptSize = { ...promptSizeInit }
        this.myPremade = undefined
        this.myStarter = ''
        this.userPromptsJSON = null
    }
}
