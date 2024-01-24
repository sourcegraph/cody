import { omit } from 'lodash'
import * as vscode from 'vscode'

import type { CodyCommand, CustomCommandType } from '@sourcegraph/cody-shared'

import { logDebug, logError } from '../../log'

import { ConfigFileName, type CodyCommandsFile, type CodyCommandsFileJSON } from '..'
import { fromSlashCommand, toSlashCommand } from '../prompt/utils'
import {
    constructFileUri,
    createJSONFile,
    deleteFile,
    getFileContentText,
    openCustomCommandDocsLink,
    saveJSONFile,
} from './helpers'
import { showNewCustomCommandMenu } from '../menus'
import { commandTools } from '../utils/tools-provider'

/**
 * Handles loading, building, and maintaining custom commands from the cody.json files.
 */
export class CustomCommandsStore implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    public commandsJSON: CodyCommandsFileJSON | null = null
    public customCommandsMap = new Map<string, CodyCommand>()

    public jsonFileUris: { user?: vscode.Uri; workspace?: vscode.Uri }

    constructor() {
        const { homeDir, workspaceRoot } = commandTools.getUserInfo()
        this.jsonFileUris = {
            user: constructFileUri(ConfigFileName.vscode, homeDir),
            workspace: constructFileUri(ConfigFileName.vscode, workspaceRoot),
        }
        this.disposables.push(
            vscode.commands.registerCommand('cody.commands.add', () => this.newCustomCommandQuickPick()),
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
            const { homeDir, workspaceRoot } = commandTools.getUserInfo()

            // user commands
            if (homeDir) {
                await this.build('user')
            }

            // only build workspace prompts if the workspace is trusted
            if (workspaceRoot && vscode.workspace.isTrusted) {
                await this.build('workspace')
            }
        } catch (error) {
            logError('CustomCommandsStore:refresh', 'failed', { verbose: error })
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
        // Security: Make sure workspace is trusted before building commands from workspace
        if (type === 'workspace' && !vscode.workspace.isTrusted) {
            return null
        }

        try {
            const content = await this.getPromptsFromFileSystem(type)
            if (!content) {
                return null
            }
            const json = JSON.parse(content) as CodyCommandsFileJSON
            const commands = Object.entries(json.commands)
            for (const [key, prompt] of commands) {
                const current: CodyCommand = { ...prompt, slashCommand: toSlashCommand(key) }
                current.type = type
                current.mode = current.mode ?? 'ask'
                this.customCommandsMap.set(current.slashCommand, current)
            }
            if (type === 'user') {
                this.commandsJSON = json
            }
        } catch (error) {
            logDebug('CustomCommandsStore:build', 'failed', { verbose: error })
        }
        return this.customCommandsMap
    }

    /**
     * Quick pick for creating a new custom command
     */
    private async newCustomCommandQuickPick(): Promise<void> {
        const commands = [...this.customCommandsMap.values()].map(c => c.slashCommand)
        const newCommand = await showNewCustomCommandMenu(commands)
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
            logDebug('CustomCommandsStore:addJSONFile:create', 'failed', { verbose: error })
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
            logError('CustomCommandsStore:clear:error:', `Failed to remove cody.json file for${type}`)
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
