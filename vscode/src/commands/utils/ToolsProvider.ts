import { exec } from 'child_process'
import os from 'os'
import { promisify } from 'util'

import * as vscode from 'vscode'

import { getEditor } from '../../editor/active-editor'
import { logDebug, logError } from '../../log'

import { UserWorkspaceInfo } from '.'
import { outputWrapper } from './helpers'

const rootPath: () => string | undefined = () => vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath
const currentFilePath: () => string | undefined = () => getEditor().active?.document.uri.fsPath
const homePath = os.homedir() || process.env.HOME || process.env.USERPROFILE || ''
const _exec = promisify(exec)
/**
 * Provides utility methods and tools for working with the file system, running commands,
 * and getting user/workspace info.
 */
export class ToolsProvider {
    private user: UserWorkspaceInfo
    private shell = vscode.env.shell

    constructor(public context: vscode.ExtensionContext) {
        this.user = this.getUserInfo()
    }

    /**
     * Get the user's workspace info
     */
    public getUserInfo(): UserWorkspaceInfo {
        if (this.user?.workspaceRoot) {
            return this.user
        }
        const appRoot = vscode.env.appRoot
        return {
            homeDir: homePath,
            workspaceRoot: rootPath(),
            currentFilePath: currentFilePath(),
            appRoot,
        }
    }

    /**
     * Open a file in the editor
     */
    public async openFile(uri?: vscode.Uri): Promise<void> {
        return vscode.commands.executeCommand('vscode.open', uri)
    }

    /**
     * Open a folder in the file explorer
     */
    public async openFolder(): Promise<void> {
        await vscode.commands.executeCommand('vscode.openFolder', rootPath())
    }

    /**
     * Execute a command in the terminal
     */
    public async exeCommand(command: string, runFromWSRoot = true): Promise<string | undefined> {
        if (!this.shell) {
            void vscode.window.showErrorMessage('Shell command is not supported your current workspace.')
            return
        }
        // Expand the ~/ in command with the home directory if any of the substring starts with ~/ with a space before it
        const homeDir = this.user.homeDir + '/' || ''
        const filteredCommand = command.replaceAll(/(\s~\/)/g, ` ${homeDir}`)
        try {
            const { stdout, stderr } = await _exec(filteredCommand, {
                cwd: runFromWSRoot ? rootPath() : currentFilePath(),
                encoding: 'utf8',
            })
            const output = stdout || stderr
            // stringify the output of the command first
            const outputString = JSON.stringify(output.trim())
            if (!outputString) {
                throw new Error('Empty output')
            }
            logDebug('ToolsProvider:exeCommand', command, { verbose: outputString })
            return outputWrapper.replace('{command}', command).replace('{output}', outputString)
        } catch (error) {
            logError('ToolsProvider:exeCommand', 'failed', { verbose: error })
            void vscode.window.showErrorMessage(
                'Failed to run command. Please make sure the command works in your terminal before trying again.'
            )
        }
        return
    }

    /**
     * Check if a file exists
     */
    public async doesUriExist(uri?: vscode.Uri): Promise<boolean> {
        if (!uri) {
            return false
        }
        try {
            return (uri && !!(await vscode.workspace.fs.stat(uri))) || false
        } catch {
            return false
        }
    }
}
