import { exec, spawnSync } from 'child_process'
import os from 'os'
import { promisify } from 'util'

import * as vscode from 'vscode'

import { debug } from '../log'

import { getFileNameFromPath, getFileToRemove, outputWrapper } from './helper'

const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath
const currentFilePath = vscode.window.activeTextEditor?.document.uri.fsPath
const homePath = os.homedir()
const _exec = promisify(exec)
/**
 * Provides utility methods and tools for working with the file system, running commands,
 * and getting user/workspace info.
 */
export class MyToolsProvider {
    private tools = new Map<string, string>()
    private user: { homeDir: string; workspaceRoot?: string; currentFilePath?: string }

    constructor(public context: vscode.ExtensionContext) {
        this.user = this.getUserInfo()
    }

    public getUserInfo(): { homeDir: string; workspaceRoot?: string; currentFilePath?: string } {
        if (this.user?.workspaceRoot) {
            return this.user
        }
        return {
            homeDir: homePath,
            workspaceRoot: rootPath,
            currentFilePath,
        }
    }

    public async openFile(uri?: vscode.Uri): Promise<void> {
        return vscode.commands.executeCommand('vscode.open', uri)
    }

    public async openFolder(): Promise<void> {
        await vscode.commands.executeCommand('vscode.openFolder', rootPath)
    }

    // TODO migrate to exeCommand then remove
    public runCommand(command: string, args: string[] = [], runFromWSRoot = true): string {
        // Expand the ~ to the user's home directory
        const homeDir = this.user.homeDir + '/' || ''
        // Replace the ~/ with the home directory if arg starts with ~/
        const filteredArgs = args.map(arg => arg.replace(/^~\//, homeDir))
        const fullCommand = `${command} ${args.join(' ')}`
        const terminalWarning = 'Please make sure the command works in your terminal before trying again.'
        try {
            const output =
                spawnSync(command, filteredArgs, {
                    cwd: runFromWSRoot ? rootPath : currentFilePath,
                    encoding: 'utf8',
                }) || ''
            // stringify the output of the command first
            const outputString = output.stdout?.trim() || ''
            if (!outputString) {
                void vscode.window.showInformationMessage(`No output return from ${fullCommand}. ${terminalWarning}`)
                return outputString
            }
            debug('MyToolsProvider:runCommand', command, { verbose: JSON.stringify(outputString) })
            return outputWrapper.replace('{command}', fullCommand).replace('{output}', JSON.stringify(outputString))
        } catch (error) {
            // handle error
            void vscode.window.showInformationMessage(`Failed to run ${fullCommand}. ${terminalWarning}`)
            debug('MyToolsProvider:runCommand', 'failed', { verbose: error })
            return ''
        }
    }

    public async exeCommand(command: string, runFromWSRoot = true): Promise<string | undefined> {
        // Expand the ~/ in command with the home directory if any of the substring starts with ~/ with a space before it
        const homeDir = this.user.homeDir + '/' || ''
        const filteredCommand = command.replace(/(\s~\/)/g, ` ${homeDir}`)
        try {
            const { stdout, stderr } = await _exec(filteredCommand, {
                cwd: runFromWSRoot ? rootPath : currentFilePath,
                encoding: 'utf8',
            })

            const output = stdout || stderr
            // stringify the output of the command first
            const outputString = JSON.stringify(output.trim())
            if (!outputString) {
                throw new Error('Empty output')
            }
            debug('MyToolsProvider:exeCommand', command, { verbose: JSON.stringify(outputString) })
            return outputWrapper.replace('{command}', command).replace('{output}', JSON.stringify(outputString))
        } catch (error) {
            debug('MyToolsProvider:exeCommand', 'failed', { verbose: error })
            void vscode.window.showErrorMessage(
                'Failed to run command. Please make sure the command works in your terminal before trying again.'
            )
            return
        }
    }

    // WIP: A tool that allows the user to interact with the the file system
    public async runFileSystemCommand(command: string): Promise<void> {
        switch (command) {
            case 'add': {
                const selectedFile = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    openLabel: 'Select File',
                })
                if (selectedFile) {
                    const fileName = getFileNameFromPath(selectedFile[0].path)
                    const filePath = selectedFile[0].path
                    if (fileName && filePath) {
                        this.tools.set(fileName, filePath)
                    }
                }
                break
            }
            case 'remove': {
                const fileToRemove = await getFileToRemove(Array.from(this.tools.keys()))
                if (fileToRemove) {
                    this.tools.delete(fileToRemove)
                }
                break
            }
            default:
                return
        }
    }
}
