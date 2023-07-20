import { spawnSync } from 'child_process'
import os from 'os'

import * as vscode from 'vscode'

const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath
const currentFilePath = vscode.window.activeTextEditor?.document.uri.fsPath
const homePath = os.homedir()

// WIP: A Class that provides different tools for users to use during prompt building
export class MyToolsProvider {
    private tools = new Map<string, string>()
    private username: string

    constructor(public context: vscode.ExtensionContext) {
        this.username = this.runCommand('git', ['config', 'user.name'])
    }

    public getUserInfo(): { name: string; homeDir: string; workspaceRoot?: string; currentFilePath?: string } {
        const user = {
            name: this.username,
            homeDir: homePath,
            workspaceRoot: rootPath,
            currentFilePath,
        }
        return user
    }

    public async openFolder(): Promise<void> {
        await vscode.commands.executeCommand('vscode.openFolder', rootPath)
    }

    public runCommand(command: string, args: string[] = [], runFromWSRoot = true): string {
        const fullCommand = `${command} ${args.join(' ')}`
        const output = spawnSync(command, args, { cwd: runFromWSRoot ? rootPath : currentFilePath, encoding: 'utf8' })
        return outputWrapper.replace('{command}', fullCommand).replace('{output}', output.stdout.toString().trim())
    }

    // A tool that allows the user to interact with the the file system
    public async runFileSystemCommand(command: string): Promise<void> {
        switch (command) {
            case 'add': {
                const file = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    openLabel: 'Select File',
                })
                if (file) {
                    const fileName = file[0].path.split('/').pop()
                    const filePath = file[0].path
                    if (fileName && filePath) {
                        this.tools.set(fileName, filePath)
                    }
                }
                break
            }
            case 'remove': {
                const fileToRemove = await vscode.window.showQuickPick(Array.from(this.tools.keys()))
                if (fileToRemove) {
                    this.tools.delete(fileToRemove)
                }
                break
            }
        }
    }
}

const outputWrapper = `
Here is the output of \`{command}\` command:
\`\`\`sh
{output}
\`\`\``
