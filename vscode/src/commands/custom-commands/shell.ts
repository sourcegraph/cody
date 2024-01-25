import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'os'

import * as vscode from 'vscode'

import { logError } from '../../log'

import { outputWrapper } from './helpers'
import { MAX_CURRENT_FILE_TOKENS, type ContextFile, truncateText } from '@sourcegraph/cody-shared'

const _exec = promisify(exec)

const homePath = os.homedir() || process.env.HOME || process.env.USERPROFILE || ''
const wsRoot: () => string | undefined = () => vscode.workspace.workspaceFolders?.[0]?.toString()

/**
 * Execute a command in the terminal
 */
export async function getContextFileFromShell(command: string): Promise<ContextFile[]> {
    if (!vscode.env.shell) {
        void vscode.window.showErrorMessage('Shell command is not supported your current workspace.')
        return []
    }

    // Expand the ~/ in command with the home directory if any of the substring starts with ~/ with a space before it
    const homeDir = `${homePath}/` || ''
    const filteredCommand = command.replaceAll(/(\s~\/)/g, ` ${homeDir}`)

    try {
        const { stdout, stderr } = await _exec(filteredCommand, {
            cwd: wsRoot(),
            encoding: 'utf8',
        })

        const output = stdout || stderr

        // stringify the output of the command first
        const outputString = JSON.stringify(output.trim())
        if (!outputString) {
            throw new Error('Empty output')
        }

        const context = outputWrapper.replace('{command}', command).replace('{output}', outputString)

        const file = {
            type: 'file',
            content: truncateText(context, MAX_CURRENT_FILE_TOKENS),
            title: 'Terminal Output',
            uri: vscode.Uri.file('terminal-output'),
            source: 'terminal',
        } as ContextFile

        return [file]
    } catch (error) {
        logError('ToolsProvider:exeCommand', 'failed', { verbose: error })
        vscode.window.showErrorMessage('Command Failed: Please sure the command works in your terminal.')
    }

    return []
}
