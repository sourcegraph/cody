import os from 'node:os'
import { omit } from 'lodash'
import * as vscode from 'vscode'

import type { CodyCommand } from '@sourcegraph/cody-shared'

import { logDebug, logError } from '../../log'

import { isMacOS } from '@sourcegraph/cody-shared'
import { CustomCommandType } from '@sourcegraph/cody-shared'
import { URI, Utils } from 'vscode-uri'
import { getConfiguration } from '../../configuration'
import { showNewCustomCommandMenu } from '../menus'
import { type CodyCommandsFile, ConfigFiles } from '../types'
import { createFileWatchers, tryCreateCodyJSON, writeToCodyJSON } from '../utils/config-file'
import { buildCodyCommandMap } from '../utils/get-commands'
import { getDocText } from '../utils/workspace-files'

const isTesting = process.env.CODY_TESTING === 'true'
const userHomePath = os.homedir() || process.env.HOME || process.env.USERPROFILE || ''

/**
 * Handles loading, building, and maintaining Custom Commands retrieved from cody.json files
 */
export class CustomCommandsManager implements vscode.Disposable {
    // Watchers for the cody.json files
    private fileWatcherDisposables: vscode.Disposable[] = []
    private registeredCommands: vscode.Disposable[] = []
    private disposables: vscode.Disposable[] = []

    public customCommandsMap = new Map<string, CodyCommand>()

    // Configuration files
    protected configFileName
    private userConfigFile
    private get workspaceConfigFile(): vscode.Uri | undefined {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        return workspaceFolder ? Utils.joinPath(workspaceFolder.uri, this.configFileName) : undefined
    }

    constructor() {
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
            ),
            vscode.commands.registerCommand('cody.commands.get-custom-commands', () =>
                [...this.customCommandsMap].map(command => command[1])
            )
        )
    }

    /**
     // TODO (bee) Migrate to use .cody/commands.json
     * Create file watchers for cody.json files.
     * Automatically update the command map when the cody.json files are changed
     */
    public init(): void {
        const createWatcherCallbacks = () => ({
            onDidCreate: () => this.refresh?.(),
            onDidChange: () => this.refresh?.(),
            onDidDelete: () => this.refresh?.(),
        })

        const addWatcher = (watcher: vscode.FileSystemWatcher | null) => {
            if (watcher) {
                const { onDidCreate, onDidChange, onDidDelete } = createWatcherCallbacks()
                this.fileWatcherDisposables.push(
                    watcher,
                    watcher.onDidCreate(onDidCreate),
                    watcher.onDidChange(onDidChange),
                    watcher.onDidDelete(onDidDelete)
                )
            }
        }

        addWatcher(createFileWatchers(this.userConfigFile))
        addWatcher(vscode.workspace.isTrusted ? createFileWatchers(this.workspaceConfigFile) : null)
    }

    /**
     * Gets the map of custom commands.
     *
     * The custom commands map is a collection of CodyCommand objects, where the key
     * is the command name and the value is the command object.
     */
    public get commands(): Map<string, CodyCommand> {
        return this.customCommandsMap
    }

    /**
     * Get the uri of the cody.json file for the given type
     */
    private getConfigFileByType(type: CustomCommandType): vscode.Uri | undefined {
        return type === CustomCommandType.User ? this.userConfigFile : this.workspaceConfigFile
    }

    /**
     * Rebuild the Custom Commands Map from the cody.json files
     */
    public async refresh(): Promise<CodyCommandsFile> {
        try {
            // Deregister all commands before rebuilding them to avoid duplicates
            this.disposeRegisteredCommands()
            // Reset the map before rebuilding
            this.customCommandsMap = new Map<string, CodyCommand>()

            const buildUserCommands = this.userConfigFile?.path
                ? this.build(CustomCommandType.User)
                : Promise.resolve()

            // 🚨 SECURITY: Only build workspace command in trusted workspace
            const buildWorkspaceCommands = vscode.workspace.isTrusted
                ? this.build(CustomCommandType.Workspace)
                : Promise.resolve()

            await Promise.all([buildUserCommands, buildWorkspaceCommands])
        } catch (error) {
            logError('CustomCommandsProvider:refresh', 'failed', { verbose: error })
        }

        return { commands: this.customCommandsMap }
    }

    /**
     * Handles building the Custom Commands Map from the cody.json files
     *
     * 🚨 SECURITY: Only build workspace command in trusted workspace
     */
    public async build(type: CustomCommandType): Promise<Map<string, CodyCommand> | null> {
        const uri = this.getConfigFileByType(type)
        if (!uri || (type === CustomCommandType.Workspace && !vscode.workspace.isTrusted)) {
            return null
        }
        try {
            const content = await getDocText(uri)
            if (!content.trim()) {
                return null
            }
            const customCommandsMap = buildCodyCommandMap(type, content)
            for (const [key, command] of customCommandsMap) {
                this.customCommandsMap.set(key, command)

                this.registeredCommands.push(
                    vscode.commands.registerCommand(`cody.command.custom.${key}`, () =>
                        vscode.commands.executeCommand('cody.action.command', key, { source: 'editor' })
                    )
                )
            }
        } catch (error) {
            logError('CustomCommandsProvider:build', 'failed', { verbose: error })
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

        logDebug('CustomCommandsProvider:newCustomCommandQuickPick:', 'saved', {
            verbose: newCommand,
        })
    }

    /**
     * Add the newly create command via quick pick to the cody.json file on disk
     */
    private async save(
        id: string,
        command: CodyCommand,
        type: CustomCommandType = CustomCommandType.User
    ): Promise<void> {
        const uri = this.getConfigFileByType(type)
        if (!uri) {
            return
        }
        try {
            // Get the current cody.json file content or create an empty one if it doesn't exist
            const fileContent = (await getDocText(uri)) || '{}'
            const parsed = JSON.parse(fileContent) as Record<string, any>
            const commands = parsed.commands ?? parsed
            commands[id] = omit(command, 'key')
            await writeToCodyJSON(uri, parsed)
            await this.refresh()

            // Notify user
            const isUserCommand = type === CustomCommandType.User
            const buttonTitle = `Open ${isUserCommand ? 'User' : 'Workspace'} Settings (JSON)`

            void vscode.window
                .showInformationMessage(`New ${id} command saved to ${type} settings`, buttonTitle)
                .then(async choice => {
                    if (choice === buttonTitle) {
                        await this.configFileActions(type, 'open')
                    }
                })
        } catch (error) {
            const errorMessage = 'Failed to save command to cody.json:'
            this.showSystemError(errorMessage, error)
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
                const bin = isMacOS() ? 'Trash' : 'Recycle Bin'
                const confirmationKey = `Move to ${bin}`
                // Playwright cannot capture and interact with pop-up modal in VS Code,
                // so we need to turn off modal mode for the display message during tests.
                const modal = !isTesting
                const choice = await vscode.window.showInformationMessage(
                    `Are you sure you want to delete your Cody ${fileType}?`,
                    { detail: `You can restore this file from the ${bin}.`, modal },
                    confirmationKey
                )
                if (choice === confirmationKey) {
                    await vscode.workspace.fs.delete(uri)
                }
                break
            }
            case 'create':
                try {
                    await tryCreateCodyJSON(uri)
                    const choice = await vscode.window.showInformationMessage(
                        `Cody ${type} settings file created`,
                        'View Documentation'
                    )
                    if (choice === 'View Documentation') {
                        await openCustomCommandDocsLink()
                    }
                } catch (error) {
                    this.showSystemError('Failed to create cody.json file:', error)
                }
                break
        }
    }

    private showSystemError(title: string, error: any): void {
        logDebug('CustomCommandsProvider', title, { verbose: error })
        void vscode.window.showErrorMessage(`${title} ${error}`)
    }

    /**
     * Reset
     */
    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposeRegisteredCommands()
        this.disposeWatchers()
        this.customCommandsMap = new Map<string, CodyCommand>()
    }

    private disposeWatchers(): void {
        for (const disposable of this.fileWatcherDisposables) {
            disposable.dispose()
        }
        this.fileWatcherDisposables = []
    }

    private disposeRegisteredCommands(): void {
        for (const rc of this.registeredCommands) {
            rc.dispose()
        }
        this.registeredCommands = []
    }
}

export async function openCustomCommandDocsLink(): Promise<void> {
    const uri = 'https://sourcegraph.com/docs/cody/custom-commands'
    await vscode.env.openExternal(vscode.Uri.parse(uri))
}
