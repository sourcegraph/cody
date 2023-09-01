import * as vscode from 'vscode'

import { Preamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import {
    CodyPrompt,
    CodyPromptType,
    ConfigFileName,
    MyPrompts,
    MyPromptsJSON,
} from '@sourcegraph/cody-shared/src/chat/prompts'
import { fromSlashCommand, toSlashCommand } from '@sourcegraph/cody-shared/src/chat/prompts/utils'
import { newPromptMixin, PromptMixin } from '@sourcegraph/cody-shared/src/prompt/prompt-mixin'

import { debug } from '../log'

import {
    constructFileUri,
    createJSONFile,
    deleteFile,
    getFileContentText,
    isUserType,
    saveJSONFile,
} from './utils/helpers'
import { promptSizeInit } from './utils/menu'

/**
 * The CustomPromptsStore class is responsible for loading and building the custom prompts from the cody.json files.
 * It has methods to get the prompts from the file system, parse the JSON, and build the prompts map.
 */
export class CustomPromptsStore implements vscode.Disposable {
    public myPromptsJSON: MyPromptsJSON | null = null
    public myPremade: Preamble | undefined = undefined
    public myPromptsMap = new Map<string, CodyPrompt>()
    public myStarter = ''

    public promptSize = promptSizeInit
    public jsonFileUris: { user?: vscode.Uri; workspace?: vscode.Uri }

    constructor(
        private isActive: boolean,
        private extensionPath: string,
        private workspaceRoot?: string,
        private homeDir?: string
    ) {
        this.jsonFileUris = {
            user: constructFileUri(ConfigFileName.vscode, homeDir),
            workspace: constructFileUri(ConfigFileName.vscode, workspaceRoot),
        }
        this.activate()
    }

    /**
     * Activate based on user's configuration setting
     */
    public activate(state = true): void {
        this.isActive = state
        if (this.isActive && !state) {
            this.dispose()
        }
    }

    /**
     * Check if the user has custom prompts from any of the cody.json files
     */
    public hasCustomPrompts(): boolean {
        const numberOfPrompts = this.promptSize.user + this.promptSize.workspace
        return this.isActive && numberOfPrompts > 0
    }

    /**
     * Get the formatted context from the json config file
     */
    public async refresh(): Promise<MyPrompts> {
        try {
            if (this.isActive) {
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
            }
        } catch (error) {
            debug('CustomPromptsStore:refresh', 'failed', { verbose: error })
        }
        return { commands: this.myPromptsMap, premade: this.myPremade, starter: this.myStarter }
    }

    /**
     * Returns myPromptsMap as an array with keys as the id
     */
    public getCommands(): [string, CodyPrompt][] {
        return [...this.myPromptsMap]
    }

    /**
     * Build the map of prompts using the json string
     */
    public async build(type: CodyPromptType): Promise<Map<string, CodyPrompt> | null> {
        try {
            const content = await this.getPromptsFromFileSystem(type)
            if (!content) {
                return null
            }
            const json = JSON.parse(content) as MyPromptsJSON
            const prompts = json.commands || json.recipes
            const promptEntries = Object.entries(prompts)

            const isOldFormat = promptEntries.some(
                ([key, prompt]) => key.split(' ').length > 1 || !('description' in prompt)
            )
            if (isOldFormat) {
                const commands = promptEntries.reduce(
                    (acc: Record<string, Omit<CodyPrompt, 'slashCommand'>>, [key, prompt]) => {
                        const slashCommand = key.trim().replaceAll(' ', '-')
                        acc[slashCommand] = { ...prompt, description: key }
                        return acc
                    },
                    {}
                )
                await this.updateJSONFile({ ...json, commands }, type)
                void vscode.window
                    .showInformationMessage(
                        `We updated ${type} Cody config to match the new format. You can customize it further manually later.`,
                        'Open config file'
                    )
                    .then(choice => {
                        if (choice === 'Open config file') {
                            const filePath = type === 'user' ? this.jsonFileUris.user : this.jsonFileUris.workspace
                            if (filePath) {
                                void vscode.window.showTextDocument(filePath)
                            }
                        }
                    })
                return await this.build(type)
            }

            for (const [key, prompt] of promptEntries) {
                const current: CodyPrompt = { ...prompt, slashCommand: toSlashCommand(key) }
                current.type = type
                this.myPromptsMap.set(current.slashCommand, current)
            }

            this.myPremade = json.premade
            // avoid duplicate starter prompts
            if (json.starter && json?.starter !== this.myStarter) {
                PromptMixin.addCustom(newPromptMixin(json.starter))
                this.myStarter = json.starter
            }
            if (type === 'user') {
                this.myPromptsJSON = json
            }
            this.promptSize[type] = this.myPromptsMap.size - 1
        } catch (error) {
            debug('CustomPromptsStore:build', 'failed', { verbose: error })
        }
        return this.myPromptsMap
    }

    /**
     * Save the user prompts to the user json file
     */
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
        const filtered = new Map<string, Omit<CodyPrompt, 'slashCommand'>>()
        for (const [key, { slashCommand, ...value }] of this.myPromptsMap) {
            if (value.type === 'user' && value.prompt !== 'separator') {
                value.type = undefined
                filtered.set(fromSlashCommand(key), value)
            }
        }
        // Add new prompt to the map
        filtered.set(fromSlashCommand(id), prompt)
        // turn prompt map into json
        const jsonContext = { ...this.myPromptsJSON }
        jsonContext.commands = Object.fromEntries(filtered)
        return this.updateJSONFile(jsonContext as MyPromptsJSON, type)
    }

    /**
     * Updates the corresponding Cody config file with the given prompts.
     */
    private async updateJSONFile(prompts: MyPromptsJSON, type: CodyPromptType): Promise<void> {
        try {
            const jsonString = JSON.stringify(prompts)
            const rootDirPath = type === 'user' ? this.jsonFileUris.user : this.jsonFileUris.workspace
            if (!rootDirPath || !jsonString) {
                throw new Error('Invalid file path or json string')
            }
            const isSaveMode = true
            await saveJSONFile(jsonString, rootDirPath, isSaveMode)
        } catch (error) {
            void vscode.window.showErrorMessage(`Failed to save to cody.json file: ${error}`)
        }
    }

    /**
     * Create a new cody.json file to the user's workspace or home directory
     */
    public async createConfig(type: CodyPromptType = 'user'): Promise<void> {
        const isUser = isUserType(type)
        const configFileUri = this.getConfigUriByType(type)
        try {
            if (configFileUri) {
                await createJSONFile(this.extensionPath, configFileUri, isUser)
                void vscode.window.showInformationMessage('A new cody.json file has been created successfully.')
                return
            }
            throw new Error('Please make sure you have a repository opened in your workspace.')
        } catch (error) {
            const errorMessage = 'Failed to create cody.json file: '
            void vscode.window.showErrorMessage(`${errorMessage} ${error}`)
            debug('CustomPromptsStore:addJSONFile:create', 'failed', { verbose: error })
        }
    }

    /**
     * Remove the cody.json file from the user's workspace or home directory
     */
    public async deleteConfig(type: CodyPromptType = 'user'): Promise<void> {
        // delete .vscode/cody.json for user command using the vs code api
        const uri = this.getConfigUriByType(type)
        if (this.promptSize[type] === 0 || !uri) {
            void vscode.window.showInformationMessage(
                'Fail: try deleting the .vscode/cody.json file in your repository or home directory manually.'
            )
            debug('CustomPromptsStore:clear:error:', 'Failed to remove cody.json file for' + type)
        }
        await deleteFile(uri)
    }

    /**
     * Open the .vscode/cody.json file for given type in the editor
     */
    public async openConfig(type: CodyPromptType = 'user'): Promise<void> {
        const uri = this.getConfigUriByType(type)
        return vscode.commands.executeCommand('vscode.open', uri)
    }

    /**
     * Get the file content of the cody.json file for the given type
     */
    private async getPromptsFromFileSystem(type: CodyPromptType): Promise<string | null> {
        const codyJsonFilePathUri = this.getConfigUriByType(type)
        if (!codyJsonFilePathUri) {
            return null
        }
        return getFileContentText(codyJsonFilePathUri)
    }

    /**
     * Reset
     */
    public dispose(): void {
        this.isActive = false
        this.myPromptsMap = new Map<string, CodyPrompt>()
        this.promptSize = { ...promptSizeInit }
        this.myPremade = undefined
        this.myStarter = ''
        this.myPromptsJSON = null
    }

    /**
     * Get the uri of the cody.json file for the given type
     */
    private getConfigUriByType(type: CodyPromptType): vscode.Uri | undefined {
        const isUserType = type === 'user'
        const configFileUri = isUserType ? this.jsonFileUris.user : this.jsonFileUris.workspace
        return configFileUri
    }
}
