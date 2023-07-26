import * as vscode from 'vscode'

import { Preamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import { newPromptMixin, PromptMixin } from '@sourcegraph/cody-shared/src/prompt/prompt-mixin'

import { constructFileUri } from './helper'
import { CodyPrompt, CodyPromptType, CustomRecipesFileName, MyPrompts, MyPromptsJSON } from './types'

/**
 * The CustomRecipesBuilder class is responsible for loading and building the custom prompts from the cody.json files.
 * It has methods to get the prompts from the file system, parse the JSON, and build the prompts map.
 */
export class CustomRecipesBuilder {
    public myPremade: Preamble | undefined = undefined
    public myPromptsMap = new Map<string, CodyPrompt>()
    public myStarter = ''
    public idSet = new Set<string>()

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

    public activate(state: boolean): void {
        if (this.isActive && !state) {
            this.dispose()
        }
        this.isActive = state
    }

    // Get the formatted context from the json config file
    public async get(): Promise<MyPrompts> {
        if (!this.isActive) {
            return { prompts: this.myPromptsMap, premade: this.myPremade, starter: this.myStarter }
        }
        // reset map and set
        this.myPromptsMap = new Map<string, CodyPrompt>()
        this.idSet = new Set<string>()
        this.promptSize = { ...promptSizeInit }
        // user prompts
        if (this.homeDir) {
            const userPrompts = await this.getPromptsFromFileSystem('user')
            this.build(userPrompts, 'user')
        }
        // workspace prompts
        if (this.workspaceRoot) {
            const wsPrompts = await this.getPromptsFromFileSystem('workspace')
            this.build(wsPrompts, 'workspace')
        }
        return { prompts: this.myPromptsMap, premade: this.myPremade, starter: this.myStarter }
    }

    // This is use to remove duplicate prompts
    public getIDs(): string[] {
        return [...this.idSet]
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
        this.promptSize[type] = this.myPromptsMap.size
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
        this.idSet = new Set<string>()
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
}
