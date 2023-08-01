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
import { constructFileUri, createJSONFile, deleteFile, getFileContentText, saveJSONFile } from './utils/helpers'

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
        private extensionPath: string,
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
        this.isActive = state
        if (this.isActive && !state) {
            this.dispose()
        }
    }

    public hasCustomPrompts(): boolean {
        const numberOfPrompts = this.promptSize.user + this.promptSize.workspace
        return this.isActive && numberOfPrompts > 0
    }

    // Get the formatted context from the json config file
    public async refresh(): Promise<MyPrompts> {
        if (!this.isActive) {
            return { commands: this.myPromptsMap, premade: this.myPremade, starter: this.myStarter }
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
        return { commands: this.myPromptsMap, premade: this.myPremade, starter: this.myStarter }
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
        const json = JSON.parse(content) as MyPromptsJSON
        const prompts = json.commands || json.recipes
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
        jsonContext.commands = Object.fromEntries(filtered)
        const jsonString = JSON.stringify(jsonContext)
        const rootDirPath = type === 'user' ? this.jsonFileUris.user : this.jsonFileUris.workspace
        if (!rootDirPath || !jsonString) {
            void vscode.window.showErrorMessage('Failed to save to cody.json file.')
            return
        }
        const isSaveMode = true
        await saveJSONFile(jsonString, rootDirPath, isSaveMode)
    }

    // Clear the user prompts from the extension storage
    public async deleteConfig(type: CodyPromptType = 'user'): Promise<void> {
        const isUserType = type === 'user'
        // delete .vscode/cody.json for user command using the vs code api
        const uri = isUserType ? this.jsonFileUris.user : this.jsonFileUris.workspace
        if (this.promptSize[type] === 0 || !uri) {
            void vscode.window.showInformationMessage(
                'Fail: try deleting the .vscode/cody.json file in your repository or home directory manually.'
            )
            debug('CustomPromptsStore:clear:error:', 'Failed to remove cody.json file for' + type)
        }
        await deleteFile(uri)
    }

    // Add a new cody.json file to the user's workspace or home directory
    public async createConfig(type: CodyPromptType = 'user'): Promise<void> {
        try {
            const extensionPath = this.extensionPath
            const isUserType = isTypeUser(type)
            const configFileUri = this.getConfigUriByType(type)
            if (configFileUri) {
                return await createJSONFile(extensionPath, configFileUri, isUserType)
            }
            throw new Error('Please make sure you have a repository opened in your workspace.')
        } catch (error) {
            const errorMessage = 'Failed to create cody.json file: '
            void vscode.window.showErrorMessage(`${errorMessage} ${error}`)
            debug('CustomPromptsStore:addJSONFile:create', 'failed', { verbose: error })
        }
    }

    public async openConfig(type: CodyPromptType = 'user'): Promise<void> {
        const uri = this.getConfigUriByType(type)
        return vscode.commands.executeCommand('vscode.open', uri)
    }

    public async createExampleConfig(): Promise<void> {
        const userExampleUri = constructFileUri('resources/samples/user-cody.json', this.extensionPath)
        if (!userExampleUri) {
            return
        }
        const content = await getFileContentText(userExampleUri)
        const exampleFilePath = this.extensionPath + '/.cody.example.json'
        const uri = vscode.Uri.parse('untitled:' + exampleFilePath)
        const document = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(document)
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 0), content)
        })
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

    private getConfigUriByType(type: CodyPromptType): vscode.Uri | undefined {
        const isUserType = type === 'user'
        const configFileUri = isUserType ? this.jsonFileUris.user : this.jsonFileUris.workspace
        return configFileUri
    }
}

export const isTypeUser = (type: CodyPromptType): boolean => type === 'user'
export const isTypeWorkspace = (type: CodyPromptType): boolean => type === 'workspace'
export const isNotCustomType = (type: CodyPromptType): boolean => type !== 'user' && type !== 'workspace'
export const isNonCustomType = (type: CodyPromptType): boolean => type === 'recently used' || type === 'default'
