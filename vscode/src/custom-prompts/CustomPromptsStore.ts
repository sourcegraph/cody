import * as vscode from 'vscode'

import { Preamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import {
    CodyPrompt,
    CodyPromptType,
    CustomPromptsConfigFileName,
    MyPrompts,
    MyPromptsJSON,
} from '@sourcegraph/cody-shared/src/chat/recipes/cody-prompts'
import { newPromptMixin, PromptMixin } from '@sourcegraph/cody-shared/src/prompt/prompt-mixin'

import { debug } from '../log'

import { promptSizeInit } from './types'
import { constructFileUri, deleteFile, getFileContentText, saveJSONFile } from './utils'

/**
 * The CustomPromptsStore class is responsible for loading and building the custom prompts from the cody.json files.
 * It has methods to get the prompts from the file system, parse the JSON, and build the prompts map.
 */
export class CustomPromptsStore {
    public myPremade: Preamble | undefined = undefined
    public myPromptsMap = new Map<string, CodyPrompt>()
    public myStarter = ''

    public userPromptsJSON: MyPromptsJSON | null = null

    public promptSize = promptSizeInit
    public jsonFileUris: { user?: vscode.Uri; workspace?: vscode.Uri }

    constructor(
        private isActive: boolean,
        private workspaceRoot?: string,
        private homeDir?: string
    ) {
        this.jsonFileUris = {
            user: constructFileUri(CustomPromptsConfigFileName, homeDir),
            workspace: constructFileUri(CustomPromptsConfigFileName, workspaceRoot),
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
        return { prompts: this.myPromptsMap, premade: this.myPremade, starter: this.myStarter }
    }

    // Return myPromptsMap as an array with keys as the id
    public getCommands(): [string, CodyPrompt][] {
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
        const prompts = json.prompts
        for (const key in prompts) {
            if (Object.prototype.hasOwnProperty.call(prompts, key)) {
                const prompt = prompts[key]
                prompt.name = key
                prompt.type = type
                if (prompt.slashCommand) {
                    const slashCommand = `/${prompt.slashCommand}`
                    prompt.slashCommand = slashCommand
                }
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
            if (value.type === 'user' && value.prompt !== 'seperator') {
                filtered.set(key, value)
            }
        }
        // Add new prompt to the map
        filtered.set(id, prompt)
        // turn prompt map into json
        const jsonContext = { ...this.userPromptsJSON }
        jsonContext.prompts = Object.fromEntries(filtered)
        const jsonString = JSON.stringify(jsonContext)
        const rootDirPath = type === 'user' ? this.jsonFileUris.user : this.jsonFileUris.workspace
        if (!rootDirPath || !jsonString) {
            void vscode.window.showErrorMessage('Failed to save to cody.json file.')
            return
        }
        const isSaveMode = true
        await saveJSONFile(jsonString, rootDirPath, isSaveMode)
    }

    public async delete(type: CodyPromptType = 'user'): Promise<void> {
        const isUserType = type === 'user'
        // delete .vscode/cody.json for user command using the vs code api
        const uri = isUserType ? this.jsonFileUris.user : this.jsonFileUris.workspace
        if (this.promptSize[type] === 0 || !uri) {
            void vscode.window.showInformationMessage(
                'Fail: try deleting the .vscode/cody.json file in your repository or home directory manually.'
            )
            debug('CommandsController:clear:error:', 'Failed to remove cody.json file for' + type)
        }
        await deleteFile(uri)
    }

    // Get the context of the json file from the file system
    private async getPromptsFromFileSystem(type: CodyPromptType): Promise<string | null> {
        if (type === 'recently used' || type === 'default') {
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
