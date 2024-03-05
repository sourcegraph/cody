import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'os'

import * as vscode from 'vscode'

import { logError } from '../../log'

import path from 'node:path/posix'
import {
    type ContextItem,
    MAX_CURRENT_FILE_TOKENS,
    truncateText,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

const _exec = promisify(exec)

/**
 * Creates a context file from executing a shell command. Used by CommandsController.
 *
 * Executes the given shell command, captures the output, wraps it in a context format,
 * and returns it as a ContextFile.
 */
export async function getContextFileFromShell(command: string): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.command', async span => {
        const rootDir = os.homedir() || process.env.HOME || process.env.USERPROFILE || ''

        if (!vscode.env.shell) {
            void vscode.window.showErrorMessage('Shell command is not supported your current workspace.')
            return []
        }

        // Expand the ~/ in command with the home directory if any of the substring starts with ~/ with a space before it
        const filteredCommand = command.replaceAll(/(\s~\/)/g, ` ${rootDir}${path.sep}`)
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.path
        try {
            const { stdout, stderr } = await _exec(filteredCommand, {
                cwd: wsRoot,
                encoding: 'utf8',
            })

            // stringify the output of the command first
            const output = stdout ?? stderr
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
            } as ContextItem

            return [file]
        } catch (error) {
            // Handles errors and empty output
            console.error('getContextFileFromShell > failed', error)
            logError('getContextFileFromShell', 'failed', { verbose: error })
            void vscode.window.showErrorMessage('Command Failed: Make sure the command works locally.')
            return []
        }
    })
}

const outputWrapper = `
Terminal output from the \`{command}\` command enclosed between <OUTPUT0412> tags:
<OUTPUT0412>
{output}
</OUTPUT0412>`
