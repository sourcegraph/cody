import * as vscode from 'vscode'

import { Preamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import { newPromptMixin, PromptMixin } from '@sourcegraph/cody-shared/src/prompt/prompt-mixin'

import { constructFileUri } from './helper'
import { CodyPrompt, CodyPromptType, CustomRecipesFileName, MyPrompts, MyPromptsJSON } from './types'

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
        private workspaceRoot?: string,
        private homeDir?: string
    ) {
        this.jsonFileUris = {
            user: constructFileUri(CustomRecipesFileName, homeDir),
            workspace: constructFileUri(CustomRecipesFileName, workspaceRoot),
        }
    }

    public async get(): Promise<MyPrompts> {
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
        this.promptSize[type] = this.myPromptsMap.size
        return this.myPromptsMap
    }

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
}

const promptSizeInit = {
    user: 0,
    workspace: 0,
}
