import { omit } from 'lodash'
import * as vscode from 'vscode'

import type { CodyCommand, CustomCommandType } from '@sourcegraph/cody-shared'

import { logDebug, logError } from '../log'

import { ConfigFileName, type CodyCommandsFile, type CodyCommandsFileJSON } from '.'
import { fromSlashCommand, toSlashCommand } from './prompt/utils'
import {
    constructFileUri,
    createJSONFile,
    deleteFile,
    getFileContentText,
    openCustomCommandDocsLink,
    saveJSONFile,
} from './utils/helpers'
import { showNewCustomCommandMenu } from './menus'

/**
 * The CustomPromptsStore class is responsible for loading and building the custom prompts from the cody.json files.
 * It has methods to get the prompts from the file system, parse the JSON, and build the prompts map.
 */
export class CustomPromptsStore implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    public commandsJSON: CodyCommandsFileJSON | null = null
    public customCommandsMap = new Map<string, CodyCommand>()

    public jsonFileUris: { user?: vscode.Uri; workspace?: vscode.Uri }

    constructor(
        private workspaceRoot?: string,
        private homeDir?: string
    ) {
        this.jsonFileUris = {
            user: constructFileUri(ConfigFileName.vscode, homeDir),
            workspace: constructFileUri(ConfigFileName.vscode, workspaceRoot),
        }
        this.disposables.push(
            vscode.commands.registerCommand('cody.commands.add', () => this.newUserCommandMenu()),
            vscode.commands.registerCommand('cody.commands.open.json', t => this.openConfig(t)),
            vscode.commands.registerCommand('cody.commands.delete.json', t => this.deleteConfig(t))
        )
    }

    /**
     * Get the formatted context from the json config file
     */
    public async refresh(): Promise<CodyCommandsFile> {
        try {
            // reset map and set
            this.customCommandsMap = new Map<string, CodyCommand>()
            // user prompts
            if (this.homeDir) {
                await this.build('user')
            }
            // only build workspace prompts if the workspace is trusted
            if (this.workspaceRoot && vscode.workspace.isTrusted) {
                await this.build('workspace')
            }
        } catch (error) {
            logError('CustomPromptsStore:refresh', 'failed', { verbose: error })
        }
        return { commands: this.customCommandsMap }
    }

    /**
     * Returns customCommandsMap as an array with keys as the id
     */
    public getCommands(): [string, CodyCommand][] {
        return [...this.customCommandsMap].sort((a, b) => a[0].localeCompare(b[0]))
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
            const json = JSON.parse(content) as CodyCommandsFileJSON
            const promptEntries = Object.entries(json.commands)

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
                                const filePath =
                                    type === 'user'
                                        ? this.jsonFileUris.user
                                        : this.jsonFileUris.workspace
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
                this.customCommandsMap.set(current.slashCommand, current)
            }
            if (type === 'user') {
                this.commandsJSON = json
            }
        } catch (error) {
            logDebug('CustomPromptsStore:build', 'failed', { verbose: error })
        }
        return this.customCommandsMap
    }

    private async newUserCommandMenu(): Promise<void> {
        const newCommand = await showNewCustomCommandMenu(this.customCommandsMap)
        if (!newCommand) {
            return
        }
        // Save the prompt to the current Map and Extension storage
        await this.save(newCommand.slashCommand, newCommand.prompt, false, newCommand.type)
        await this.refresh()
        // Notify user
        const buttonTitle = `Open ${newCommand.type === 'user' ? 'User' : 'Workspace'} Settings (JSON)`
        void vscode.window
            .showInformationMessage(
                `New ${newCommand.slashCommand} command saved to ${newCommand.type} settings`,
                buttonTitle
            )
            .then(async choice => {
                if (choice === buttonTitle) {
                    await this.openConfig(newCommand.type)
                }
            })

        logDebug('CommandsController:updateUserCommandQuick:newPrompt:', 'saved', {
            verbose: newCommand,
        })
    }

    /**
     * Save the user prompts to the user json file
     */
    private async save(
        id: string,
        prompt: CodyCommand,
        deletePrompt = false,
        type: CustomCommandType = 'user'
    ): Promise<void> {
        if (deletePrompt) {
            this.customCommandsMap.delete(id)
        } else {
            this.customCommandsMap.set(id, prompt)
        }
        // filter prompt map to remove prompt with type workspace
        const filtered = new Map<string, Omit<CodyCommand, 'slashCommand'>>()
        for (const [key, value] of this.customCommandsMap) {
            if (value.type === 'user' && value.prompt !== 'separator') {
                value.type = undefined
                filtered.set(fromSlashCommand(key), omit(value, 'slashCommand'))
            }
        }
        // Add new prompt to the map
        filtered.set(fromSlashCommand(id), omit(prompt, 'slashCommand'))
        // turn prompt map into json
        const jsonContext = { ...this.commandsJSON }
        jsonContext.commands = Object.fromEntries(filtered)
        return this.updateJSONFile(jsonContext as CodyCommandsFileJSON, type)
    }

    /**
     * Updates the corresponding Cody config file with the given prompts.
     */
    private async updateJSONFile(prompts: CodyCommandsFileJSON, type: CustomCommandType): Promise<void> {
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
    private async deleteConfig(type: CustomCommandType = 'user'): Promise<void> {
        // delete .vscode/cody.json for user command using the vs code api
        const uri = this.getConfigUriByType(type)
        if (!uri) {
            void vscode.window.showInformationMessage(
                'Fail: try deleting the .vscode/cody.json file in your repository or home directory manually.'
            )
            logError('CustomPromptsStore:clear:error:', `Failed to remove cody.json file for${type}`)
        }
        await deleteFile(uri)
    }

    /**
     * Open the .vscode/cody.json file for given type in the editor
     */
    private async openConfig(type: CustomCommandType = 'user'): Promise<void> {
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
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.customCommandsMap = new Map<string, CodyCommand>()
        this.commandsJSON = null
    }

    /**
     * Get the uri of the cody.json file for the given type
     */
    private getConfigUriByType(type: CustomCommandType): vscode.Uri | undefined {
        const configFileUri = type === 'user' ? this.jsonFileUris.user : this.jsonFileUris.workspace
        return configFileUri
    }
}
