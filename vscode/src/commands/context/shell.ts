import { exec } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import {
    type ContextItem,
    ContextItemSource,
    TokenCounterUtils,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getConfiguration } from '../../configuration'
import { logError } from '../../output-channel-logger'

const execAsync = promisify(exec)

// Pre-compute home directory path
const HOME_DIR = os.homedir() || process.env.HOME || process.env.USERPROFILE || ''

const OUTPUT_WRAPPER = `
Terminal output from the \`{command}\` command enclosed between <OUTPUT0412> tags:
<OUTPUT0412>
{output}
</OUTPUT0412>`

export async function getContextFileFromShell(command: string): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.command', async () => {
        const { agenticShellCommands } = getConfiguration()
        if (!vscode.env.shell || agenticShellCommands === 'disabled') {
            void vscode.window.showErrorMessage(
                'Shell command is not supported in your current workspace.'
            )
            return []
        }

        // Process command and workspace
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath
        const filteredCommand = command.replaceAll(/(\s~\/)/g, ` ${HOME_DIR}${path.sep}`)

        // Process allow list once
        const allowList =
            agenticShellCommands === '*' || !agenticShellCommands
                ? null
                : new Set(agenticShellCommands.split(',').map(cmd => cmd.trim()))

        try {
            // Command validation
            const commandStart = filteredCommand.split(' ')[0]
            if (
                (allowList?.size &&
                    !Array.from(allowList).some(cmd => filteredCommand.startsWith(cmd))) ||
                DISALLOWED_COMMANDS.has(commandStart)
            ) {
                void vscode.window.showErrorMessage('Cody cannot execute this command')
                throw new Error('Cody cannot execute this command')
            }

            // Execute command
            const { stdout, stderr } = await execAsync(filteredCommand, { cwd, encoding: 'utf8' })
            const output = JSON.stringify(stdout || stderr).trim()

            if (!output || output === '""') {
                throw new Error('Empty output')
            }

            // Create context item
            const content = OUTPUT_WRAPPER.replace('{command}', command).replace('{output}', output)
            const size = await TokenCounterUtils.countTokens(content)

            return [
                {
                    type: 'file',
                    content,
                    title: 'Terminal Output',
                    uri: vscode.Uri.file(command),
                    source: ContextItemSource.Terminal,
                    size,
                },
            ]
        } catch (error) {
            logError('getContextFileFromShell', 'failed', { verbose: error })
            const errorContent = `${error}`
            const size = await TokenCounterUtils.countTokens(errorContent)

            return [
                {
                    type: 'file',
                    content: errorContent,
                    title: 'Terminal Output',
                    uri: vscode.Uri.file(command),
                    source: ContextItemSource.Terminal,
                    size,
                },
            ]
        }
    })
}

// Set of disallowed commands for O(1) lookup
const DISALLOWED_COMMANDS = new Set([
    'rm',
    'chmod',
    'shutdown',
    'history',
    'user',
    'sudo',
    'su',
    'passwd',
    'chown',
    'chgrp',
    'kill',
    'reboot',
    'poweroff',
    'init',
    'systemctl',
    'journalctl',
    'dmesg',
    'lsblk',
    'lsmod',
    'modprobe',
    'insmod',
    'rmmod',
    'lsusb',
    'lspci',
])
