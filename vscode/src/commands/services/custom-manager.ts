import { omit } from 'lodash'
import * as vscode from 'vscode'
import os from 'os'

import type { CodyCommand, CustomCommandType } from '@sourcegraph/cody-shared'

import { logDebug, logError } from '../../log'

import { ConfigFileName, type CodyCommandsFile, type CodyCommandsFileJSON } from '..'
import { fromSlashCommand, toSlashCommand } from '../utils/commands'
import {
    createFileWatchers,
    createJSONFile,
    openCustomCommandDocsLink,
    saveJSONFile,
} from '../utils/helpers'
import { showNewCustomCommandMenu } from '../menus'
import { URI, Utils } from 'vscode-uri'

/**
 * Handles loading, building, and maintaining Custom Commands retrieved from cody.json files
 */
export class CustomCommandsManager implements vscode.Disposable {
    // Watchers for the cody.json files
    private fileWatcherDisposables: vscode.Disposable[] = []
    private disposables: vscode.Disposable[] = []

    public customCommandsMap = new Map<string, CodyCommand>()
    public userJSON: CodyCommandsFileJSON | null = null

    private userConfigFile: vscode.Uri | undefined
    private get workspaceConfigFile(): vscode.Uri | undefined {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
        if (!workspaceRoot) {
            return undefined
        }
        return Utils.joinPath(workspaceRoot, ConfigFileName.vscode)
    }

    constructor() {
        const userHomePath = os.homedir() || process.env.HOME || process.env.USERPROFILE || ''
        this.userConfigFile = Utils.joinPath(URI.file(userHomePath), ConfigFileName.vscode)

        this.disposables.push(
            vscode.commands.registerCommand('cody.commands.add', () => this.newCustomCommandQuickPick()),
            vscode.commands.registerCommand('cody.commands.open.json', type =>
                this.configFileActions(type, 'open')
            ),
            vscode.commands.registerCommand('cody.commands.delete.json', type =>
                this.configFileActions(type, 'delete')
            )
        )
    }

    public getCommands(): [string, CodyCommand][] {
        return [...this.customCommandsMap].sort((a, b) => a[0].localeCompare(b[0]))
    }

    /**
     * Create file watchers for cody.json files.
     * Automatically update the command map when the cody.json files are changed
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

    /**
     * Get the uri of the cody.json file for the given type
     */
    private getConfigFileByType(type: CustomCommandType): vscode.Uri | undefined {
        const configFileUri = type === 'user' ? this.userConfigFile : this.workspaceConfigFile
        return configFileUri
    }

    public async refresh(): Promise<CodyCommandsFile> {
        try {
            // Reset the map before rebuilding
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

    public async build(type: CustomCommandType): Promise<Map<string, CodyCommand> | null> {
        const uri = this.getConfigFileByType(type)
        // Security: Make sure workspace is trusted before building commands from workspace
        if (!uri || (type === 'workspace' && !vscode.workspace.isTrusted)) {
            return null
        }
        try {
            const bytes = await vscode.workspace.fs.readFile(uri)
            const content = new TextDecoder('utf-8').decode(bytes)
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
            // Keep a copy of the user json file for recreating the commands later
            if (type === 'user') {
                this.userJSON = json
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
        await this.save(newCommand.slashCommand, newCommand.prompt, newCommand.type)
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
                    await this.configFileActions(newCommand.type, 'open')
                }
            })

        logDebug('CustomCommandsProvider:newCustomCommandQuickPick:', 'saved', {
            verbose: newCommand,
        })
    }

    /**
     * Add the newly create command via quick pick to the cody.json file
     */
    private async save(
        id: string,
        prompt: CodyCommand,
        type: CustomCommandType = 'user'
    ): Promise<void> {
        this.customCommandsMap.set(id, prompt)

        // Filter map to remove commands with non-match type
        const filtered = new Map<string, Omit<CodyCommand, 'slashCommand'>>()
        for (const [key, command] of this.customCommandsMap) {
            if (command.type === type) {
                command.type = undefined
                filtered.set(fromSlashCommand(key), omit(command, 'slashCommand'))
            }
        }

        // Add the new command to the filtered map
        filtered.set(fromSlashCommand(id), omit(prompt, 'slashCommand'))

        // turn map into json
        const jsonContext = { ...this.userJSON }
        jsonContext.commands = Object.fromEntries(filtered)
        const uri = this.getConfigFileByType(type)
        if (!uri) {
            throw new Error('Invalid file path')
        }

        try {
            await saveJSONFile(jsonContext as CodyCommandsFileJSON, uri)
        } catch (error) {
            logError('CustomCommandsProvider:save', 'failed', { verbose: error })
        }
    }

    private async configFileActions(
        type: CustomCommandType,
        action: 'open' | 'delete' | 'create'
    ): Promise<void> {
        const uri = this.getConfigFileByType(type)
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
                        logDebug('CustomCommandsProvider:configActions:create', 'failed', {
                            verbose: error,
                        })
                    })
                break
        }
    }

    /**
     * Reset
     */
    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposeWatchers()
        this.customCommandsMap = new Map<string, CodyCommand>()
        this.userJSON = null
    }

    private disposeWatchers(): void {
        for (const disposable of this.fileWatcherDisposables) {
            disposable.dispose()
        }
        this.fileWatcherDisposables = []
        logDebug('CommandsController:disposeWatchers', 'watchers disposed')
    }
}
