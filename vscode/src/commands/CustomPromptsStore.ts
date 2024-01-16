import { omit } from 'lodash'
import * as vscode from 'vscode'

import { type CodyCommand, type CustomCommandType } from '@sourcegraph/cody-shared/src/commands'

import { logDebug, logError } from '../log'

import { ConfigFileName, type MyPrompts, type MyPromptsJSON } from '.'
import { fromSlashCommand, toSlashCommand } from './prompt/utils'
import {
    constructFileUri,
    createJSONFile,
    deleteFile,
    getFileContentText,
    openCustomCommandDocsLink,
    saveJSONFile,
} from './utils/helpers'
import { promptSizeInit } from './utils/menu'

/**
 * The CustomPromptsStore class is responsible for loading and building the custom prompts from the cody.json files.
 * It has methods to get the prompts from the file system, parse the JSON, and build the prompts map.
 */
export class CustomPromptsStore implements vscode.Disposable {
    public myPromptsJSON: MyPromptsJSON | null = null
    public myPromptsMap = new Map<string, CodyCommand>()

    public promptSize = promptSizeInit
    public jsonFileUris: { user?: vscode.Uri; workspace?: vscode.Uri }

    constructor(
        private isActive: boolean,
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
                this.myPromptsMap = new Map<string, CodyCommand>()
                this.promptSize = { ...promptSizeInit }
                // user prompts
                if (this.homeDir) {
                    await this.build('user')
                }
                // only build workspace prompts if the workspace is trusted
                if (this.workspaceRoot && vscode.workspace.isTrusted) {
                    await this.build('workspace')
                }
            }
        } catch (error) {
            logError('CustomPromptsStore:refresh', 'failed', { verbose: error })
        }
        return { commands: this.myPromptsMap }
    }

    /**
     * Returns myPromptsMap as an array with keys as the id
     */
    public getCommands(): [string, CodyCommand][] {
        return [...this.myPromptsMap].sort((a, b) => a[0].localeCompare(b[0]))
    }

    /**
     * Build the map of prompts using the json string
     */
    public async build(type: CustomCommandType): Promise<Map<string, CodyCommand> | null> {
        // Make sure workspace is trusted when trying to build commands from workspace config
        if (type === 'workspace' && !vscode.workspace.isTrusted) {
            return null
        }

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
                void vscode.window
                    .showInformationMessage(
                        `Your custom commands ${type} JSON (${
                            type === 'user' ? '~/.vscode/cody.json' : '.vscode/cody.json'
                        }) is using an old format, and needs to be upgraded.`,
                        'Upgrade JSON',
                        'Ignore'
                    )
                    .then(choice => {
                        if (choice === 'Upgrade JSON') {
                            // transform old format commands to the new format
                            const commands = promptEntries.reduce(
                                (
                                    acc: Record<string, Omit<CodyCommand, 'slashCommand'>>,
                                    [key, { prompt, type, context }]
                                ) => {
                                    const slashCommand = key.trim().replaceAll(' ', '-').toLowerCase()
                                    acc[slashCommand] = { description: key, prompt, type, context }
                                    return acc
                                },
                                {}
                            )

                            // write transformed commands to the corresponding config file
                            void this.updateJSONFile({ ...json, commands }, type).then(() => {
                                // open the updated settings file
                                const filePath = type === 'user' ? this.jsonFileUris.user : this.jsonFileUris.workspace
                                if (filePath) {
                                    void vscode.window.showTextDocument(filePath)
                                }
                            })
                        }
                    })

                return null
            }
            for (const [key, prompt] of promptEntries) {
                const current: CodyCommand = { ...prompt, slashCommand: toSlashCommand(key) }
                current.type = type
                this.myPromptsMap.set(current.slashCommand, current)
            }
            if (type === 'user') {
                this.myPromptsJSON = json
            }
            this.promptSize[type] = this.myPromptsMap.size
        } catch (error) {
            logDebug('CustomPromptsStore:build', 'failed', { verbose: error })
        }
        return this.myPromptsMap
    }

    /**
     * Save the user prompts to the user json file
     */
    public async save(
        id: string,
        prompt: CodyCommand,
        deletePrompt = false,
        type: CustomCommandType = 'user'
    ): Promise<void> {
        if (deletePrompt) {
            this.myPromptsMap.delete(id)
        } else {
            this.myPromptsMap.set(id, prompt)
        }
        // filter prompt map to remove prompt with type workspace
        const filtered = new Map<string, Omit<CodyCommand, 'slashCommand'>>()
        for (const [key, value] of this.myPromptsMap) {
            if (value.type === 'user' && value.prompt !== 'separator') {
                value.type = undefined
                filtered.set(fromSlashCommand(key), omit(value, 'slashCommand'))
            }
        }
        // Add new prompt to the map
        filtered.set(fromSlashCommand(id), omit(prompt, 'slashCommand'))
        // turn prompt map into json
        const jsonContext = { ...this.myPromptsJSON }
        jsonContext.commands = Object.fromEntries(filtered)
        return this.updateJSONFile(jsonContext as MyPromptsJSON, type)
    }

    /**
     * Updates the corresponding Cody config file with the given prompts.
     */
    private async updateJSONFile(prompts: MyPromptsJSON, type: CustomCommandType): Promise<void> {
        try {
            const rootDirPath = type === 'user' ? this.jsonFileUris.user : this.jsonFileUris.workspace
            if (!rootDirPath) {
                throw new Error('Invalid file path')
            }
            await saveJSONFile(prompts, rootDirPath)
        } catch (error) {
            void vscode.window.showErrorMessage(`Failed to save to cody.json file: ${error}`)
        }
    }

    /**
     * Create a new cody.json file to the user's workspace or home directory
     */
    public async createConfig(type: CustomCommandType = 'user'): Promise<void> {
        const configFileUri = this.getConfigUriByType(type)
        try {
            if (configFileUri) {
                await createJSONFile(configFileUri)
                void vscode.window
                    .showInformationMessage(`Cody ${type} settings file created`, 'View Documentation')
                    .then(async choice => {
                        if (choice === 'View Documentation') {
                            await openCustomCommandDocsLink()
                        }
                    })
                return
            }
            throw new Error('Please make sure you have a repository opened in your workspace.')
        } catch (error) {
            const errorMessage = 'Failed to create cody.json file: '
            void vscode.window.showErrorMessage(`${errorMessage} ${error}`)
            logDebug('CustomPromptsStore:addJSONFile:create', 'failed', { verbose: error })
        }
    }

    /**
     * Remove the cody.json file from the user's workspace or home directory
     */
    public async deleteConfig(type: CustomCommandType = 'user'): Promise<void> {
        // delete .vscode/cody.json for user command using the vs code api
        const uri = this.getConfigUriByType(type)
        if (this.promptSize[type] === 0 || !uri) {
            void vscode.window.showInformationMessage(
                'Fail: try deleting the .vscode/cody.json file in your repository or home directory manually.'
            )
            logError('CustomPromptsStore:clear:error:', 'Failed to remove cody.json file for' + type)
        }
        await deleteFile(uri)
    }

    /**
     * Open the .vscode/cody.json file for given type in the editor
     */
    public async openConfig(type: CustomCommandType = 'user'): Promise<void> {
        const uri = this.getConfigUriByType(type)
        return vscode.commands.executeCommand('vscode.open', uri)
    }

    /**
     * Get the file content of the cody.json file for the given type
     */
    private async getPromptsFromFileSystem(type: CustomCommandType): Promise<string | null> {
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
        this.myPromptsMap = new Map<string, CodyCommand>()
        this.promptSize = { ...promptSizeInit }
        this.myPromptsJSON = null
    }

    /**
     * Get the uri of the cody.json file for the given type
     */
    private getConfigUriByType(type: CustomCommandType): vscode.Uri | undefined {
        const configFileUri = type === 'user' ? this.jsonFileUris.user : this.jsonFileUris.workspace
        return configFileUri
    }
}
