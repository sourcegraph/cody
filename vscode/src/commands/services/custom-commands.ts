import { omit } from 'lodash'
import * as vscode from 'vscode'
import os from 'os'

import type { CodyCommand } from '@sourcegraph/cody-shared'

import { logDebug, logError } from '../../log'

import { ConfigFiles, type CodyCommandsFile } from '../types'
import { createFileWatchers, createJSONFile, saveJSONFile } from '../utils/config-file'
import { showNewCustomCommandMenu } from '../menus'
import { URI, Utils } from 'vscode-uri'
import { buildCodyCommandMap } from '../utils/get-commands'
import { CustomCommandType } from '@sourcegraph/cody-shared/src/commands/types'
import { getConfiguration } from '../../configuration'
import { isMac } from '@sourcegraph/cody-shared/src/common/platform'
import type { TreeViewProvider } from '../../services/tree-views/TreeViewProvider'
import { getCommandTreeItems } from '../../services/tree-views/commands'

const isTesting = process.env.CODY_TESTING === 'true'
const isMacOS = isMac()
const userHomePath = os.homedir() || process.env.HOME || process.env.USERPROFILE || ''

/**
 * Handles loading, building, and maintaining Custom Commands retrieved from cody.json files
 */
export class CustomCommandsManager implements vscode.Disposable {
    // Watchers for the cody.json files
    private fileWatcherDisposables: vscode.Disposable[] = []
    private disposables: vscode.Disposable[] = []

    public customCommandsMap = new Map<string, CodyCommand>()
    public userJSON: Record<string, unknown> | null = null

    // Configuration files
    protected configFileName
    private userConfigFile
    private get workspaceConfigFile(): vscode.Uri | undefined {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
        if (!workspaceRoot) {
            return undefined
        }
        return Utils.joinPath(workspaceRoot, this.configFileName)
    }

    constructor(private sidebar: TreeViewProvider) {
        // TODO (bee) Migrate to use .cody/commands.json for VS Code
        // Right now agent is using .cody/commands.json for Custom Commands,
        // .vscode/cody.json in VS Code.
        const workspaceConfig = vscode.workspace.getConfiguration()
        const config = getConfiguration(workspaceConfig)
        this.configFileName = config.isRunningInsideAgent ? ConfigFiles.COMMAND : ConfigFiles.VSCODE
        this.userConfigFile = Utils.joinPath(URI.file(userHomePath), this.configFileName)

        this.disposables.push(
            vscode.commands.registerCommand('cody.menu.custom.build', () =>
                this.newCustomCommandQuickPick()
            ),
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
     // TODO (bee) Migrate to use .cody/commands.json
     * Create file watchers for cody.json files.
     * Automatically update the command map when the cody.json files are changed
     */
    public init(): void {
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
        const configFileUri =
            type === CustomCommandType.User ? this.userConfigFile : this.workspaceConfigFile
        return configFileUri
    }

    public async refresh(): Promise<CodyCommandsFile> {
        try {
            // Reset the map before rebuilding
            this.customCommandsMap = new Map<string, CodyCommand>()
            // user commands
            if (this.userConfigFile?.path) {
                await this.build(CustomCommandType.User)
            }
            // only build workspace prompts if the workspace is trusted
            if (vscode.workspace.isTrusted) {
                await this.build(CustomCommandType.Workspace)
            }
        } catch (error) {
            logError('CustomCommandsProvider:refresh', 'failed', { verbose: error })
        }
        this.sidebar.setTreeNodes(getCommandTreeItems([...this.customCommandsMap.values()]))
        return { commands: this.customCommandsMap }
    }

    public async build(type: CustomCommandType): Promise<Map<string, CodyCommand> | null> {
        const uri = this.getConfigFileByType(type)
        // Security: Make sure workspace is trusted before building commands from workspace
        if (!uri || (type === CustomCommandType.Workspace && !vscode.workspace.isTrusted)) {
            return null
        }
        try {
            const bytes = await vscode.workspace.fs.readFile(uri)
            const content = new TextDecoder('utf-8').decode(bytes)
            if (!content.trim()) {
                throw new Error('Empty file')
            }
            const customCommandsMap = buildCodyCommandMap(type, content)
            this.customCommandsMap = new Map([...this.customCommandsMap, ...customCommandsMap])

            // Keep a copy of the user json file for recreating the commands later
            if (type === CustomCommandType.User) {
                this.userJSON = JSON.parse(content)
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
        const commands = [...this.customCommandsMap.values()].map(c => c.key)
        const newCommand = await showNewCustomCommandMenu(commands)
        if (!newCommand) {
            return
        }

        // Save the prompt to the current Map and Extension storage
        await this.save(newCommand.key, newCommand.prompt, newCommand.type)
        await this.refresh()

        // Notify user
        const isUserCommand = newCommand.type === CustomCommandType.User
        const buttonTitle = `Open ${isUserCommand ? 'User' : 'Workspace'} Settings (JSON)`
        void vscode.window
            .showInformationMessage(
                `New ${newCommand.key} command saved to ${newCommand.type} settings`,
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
        command: CodyCommand,
        type: CustomCommandType = CustomCommandType.User
    ): Promise<void> {
        this.customCommandsMap.set(id, command)
        const updated: Omit<CodyCommand, 'key'> | undefined = omit(command, ['key', 'type'])

        // Filter map to remove commands with non-match type
        const filtered = new Map<string, Omit<CodyCommand, 'key'>>()
        for (const [key, _command] of this.customCommandsMap) {
            if (_command.type === type) {
                filtered.set(key, omit(_command, ['key', 'type']))
            }
        }

        // Add the new command to the filtered map
        filtered.set(id, updated)

        // turn map into json
        const jsonContext = { ...this.userJSON }
        jsonContext.commands = Object.fromEntries(filtered)
        const uri = this.getConfigFileByType(type)
        if (!uri) {
            throw new Error('Invalid file path')
        }
        try {
            await saveJSONFile(jsonContext, uri)
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
            case 'delete': {
                let fileType = 'user settings file (~/.vscode/cody.json)'
                if (type === CustomCommandType.Workspace) {
                    fileType = 'workspace settings file (.vscode/cody.json)'
                }
                const bin = isMacOS ? 'Trash' : 'Recycle Bin'
                const confirmationKey = `Move to ${bin}`
                // Playwright cannot capture and interact with pop-up modal in VS Code,
                // so we need to turn off modal mode for the display message during tests.
                const modal = !isTesting
                vscode.window
                    .showInformationMessage(
                        `Are you sure you want to delete your Cody ${fileType}?`,
                        { detail: `You can restore this file from the ${bin}.`, modal },
                        confirmationKey
                    )
                    .then(async choice => {
                        if (choice === confirmationKey) {
                            void vscode.workspace.fs.delete(uri)
                        }
                    })
                break
            }
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

export async function openCustomCommandDocsLink(): Promise<void> {
    const uri = 'https://sourcegraph.com/docs/cody/custom-commands'
    await vscode.env.openExternal(vscode.Uri.parse(uri))
}

// TODO (bee) Migrate cody.json to new config file location
// Rename the old config files to the new location
export async function migrateCommandFiles(): Promise<void> {
    // WORKSPACE
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
    if (workspaceRoot) {
        const oldWsPath = Utils.joinPath(workspaceRoot, ConfigFiles.VSCODE)
        const newWSPath = Utils.joinPath(workspaceRoot, ConfigFiles.COMMAND)
        await migrateContent(oldWsPath, newWSPath).then(
            () => {},
            error => undefined
        )
    }

    // USER
    if (userHomePath) {
        const oldUserPath = Utils.joinPath(URI.file(userHomePath), ConfigFiles.VSCODE)
        const newUserPath = Utils.joinPath(URI.file(userHomePath), ConfigFiles.COMMAND)
        await migrateContent(oldUserPath, newUserPath).then(
            () => {},
            error => undefined
        )
    }
}

async function migrateContent(oldFile: vscode.Uri, newFile: vscode.Uri): Promise<void> {
    const oldUserContent = await tryReadFile(newFile)
    if (!oldUserContent) {
        return
    }

    const oldContent = await tryReadFile(oldFile)
    const workspaceEditor = new vscode.WorkspaceEdit()
    workspaceEditor.createFile(newFile, { ignoreIfExists: true })
    workspaceEditor.insert(newFile, new vscode.Position(0, 0), JSON.stringify(oldContent, null, 2))
    await vscode.workspace.applyEdit(workspaceEditor)
    const doc = await vscode.workspace.openTextDocument(newFile)
    await doc.save()
    workspaceEditor.deleteFile(oldFile, { ignoreIfNotExists: true })
}

async function tryReadFile(fileUri: vscode.Uri): Promise<string | undefined> {
    return vscode.workspace.fs.readFile(fileUri).then(
        content => new TextDecoder('utf-8').decode(content),
        error => undefined
    )
}
