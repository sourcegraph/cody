import { omit } from 'lodash'
import * as vscode from 'vscode'
import os from 'os'

import type { CodyCommand, CustomCommandType } from '@sourcegraph/cody-shared'

import { logDebug, logError } from '../../log'

import { ConfigFileName, type CodyCommandsFile, type CodyCommandsFileJSON } from '..'
import { fromSlashCommand, toSlashCommand } from '../utils/commands'
import { createFileWatchers, createJSONFile, openCustomCommandDocsLink, saveJSONFile } from './helpers'
import { showNewCustomCommandMenu } from '../menus'
import { URI, Utils } from 'vscode-uri'

/**
 * Handles loading, building, and maintaining custom commands from the cody.json files.
 */
export class CustomCommandsProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    // Watchers for the cody.json files
    private fileWatcherDisposables: vscode.Disposable[] = []

    public commandsJSON: CodyCommandsFileJSON | null = null
    public customCommandsMap = new Map<string, CodyCommand>()

    private userConfigFile: vscode.Uri | undefined

    constructor() {
        const userHomePath = os.homedir() || process.env.HOME || process.env.USERPROFILE || ''
        this.userConfigFile = Utils.joinPath(URI.file(userHomePath), ConfigFileName.vscode)

        this.disposables.push(
            vscode.commands.registerCommand('cody.commands.add', () => this.newCustomCommandQuickPick()),
            vscode.commands.registerCommand('cody.commands.open.json', t =>
                this.configActions(t, 'open')
            ),
            vscode.commands.registerCommand('cody.commands.delete.json', t =>
                this.configActions(t, 'delete')
            )
        )
    }

    /**
     * Create file watchers for cody.json files
     */
    public init(): void {
        this.disposeWatchers()

        const userConfigWatcher = createFileWatchers(this.userConfigFile)
        if (userConfigWatcher) {
            this.fileWatcherDisposables.push(
                userConfigWatcher,
                userConfigWatcher.onDidChange(() => this.refresh?.()),
                userConfigWatcher.onDidDelete(() => this.refresh?.())
            )
        }

        // Create file watchers in trusted workspaces only
        if (vscode.workspace.isTrusted) {
            const wsConfigWatcher = createFileWatchers(this.workspaceConfigFile)
            if (wsConfigWatcher) {
                this.fileWatcherDisposables.push(
                    wsConfigWatcher,
                    wsConfigWatcher.onDidChange(() => this.refresh?.()),
                    wsConfigWatcher.onDidDelete(() => this.refresh?.())
                )
            }
        }

        logDebug('CommandsController:fileWatcherInit', 'watchers created')
    }

    private get workspaceConfigFile(): vscode.Uri | undefined {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
        if (!workspaceRoot) {
            return undefined
        }
        return Utils.joinPath(workspaceRoot, ConfigFileName.vscode)
    }

    public async refresh(): Promise<CodyCommandsFile> {
        try {
            // reset map and set
            this.customCommandsMap = new Map<string, CodyCommand>()
            // user commands
            if (this.userConfigFile?.path) {
                await this.build('user')
            }
            // only build workspace prompts if the workspace is trusted
            if (vscode.workspace.isTrusted) {
                await this.build('workspace')
            }
        } catch (error) {
            logError('CustomCommandsProvider:refresh', 'failed', { verbose: error })
        }
        return { commands: this.customCommandsMap }
    }

    public getCommands(): [string, CodyCommand][] {
        return [...this.customCommandsMap].sort((a, b) => a[0].localeCompare(b[0]))
    }

    public async build(type: CustomCommandType): Promise<Map<string, CodyCommand> | null> {
        // Security: Make sure workspace is trusted before building commands from workspace
        if (type === 'workspace' && !vscode.workspace.isTrusted) {
            return null
        }

        try {
            const content = await this.getCommandsFromFileSystem(type)
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
            logDebug('CustomCommandsProvider:build', 'failed', { verbose: error })
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
                    await this.configActions(newCommand.type, 'open')
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
        const uri = this.getConfigUriByType(type)
        if (!uri) {
            throw new Error('Invalid file path')
        }
        await saveJSONFile(jsonContext as CodyCommandsFileJSON, uri)
    }

    /**
     * Remove the cody.json file from the user's workspace or home directory
     */
    private async configActions(
        type: CustomCommandType,
        action: 'open' | 'delete' | 'create'
    ): Promise<void> {
        const uri = this.getConfigUriByType(type)
        if (!uri) {
            return
        }
        switch (action) {
            case 'open':
                void vscode.commands.executeCommand('vscode.open', uri)
                break
            case 'delete':
                void vscode.workspace.fs.delete(uri)
                break
            case 'create':
                await createJSONFile(uri)
                    .then(() => {
                        vscode.window
                            .showInformationMessage(
                                `Cody ${type} settings file created`,
                                'View Documentation'
                            )
                            .then(async choice => {
                                if (choice === 'View Documentation') {
                                    await openCustomCommandDocsLink()
                                }
                            })
                    })
                    .catch(error => {
                        const errorMessage = 'Failed to create cody.json file: '
                        void vscode.window.showErrorMessage(`${errorMessage} ${error}`)
                        logDebug('CustomCommandsProvider:addJSONFile:create', 'failed', {
                            verbose: error,
                        })
                    })
                break
        }
    }

    /**
     * Get the file content of the cody.json file for the given type
     */
    private async getCommandsFromFileSystem(type: CustomCommandType): Promise<string | null> {
        const uri = this.getConfigUriByType(type)
        if (!uri) {
            return null
        }
        try {
            const bytes = await vscode.workspace.fs.readFile(uri)
            const content = new TextDecoder('utf-8').decode(bytes)

            return content
        } catch {
            return null
        }
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
        const configFileUri = type === 'user' ? this.userConfigFile : this.workspaceConfigFile
        return configFileUri
    }

    private disposeWatchers(): void {
        for (const disposable of this.fileWatcherDisposables) {
            disposable.dispose()
        }
        this.fileWatcherDisposables = []
        logDebug('CommandsController:disposeWatchers', 'watchers disposed')
    }
}
