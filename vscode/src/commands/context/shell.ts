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
        const agenticShellConfig = getConfiguration()?.experimentalAgenticContextOptions?.shell
        if (!vscode.env.shell) {
            void vscode.window.showErrorMessage(
                'Shell command is not supported in your current workspace.'
            )
            return []
        }

        // Process command and workspace
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath
        const filteredCommand = command.replaceAll(/(\s~\/)/g, ` ${HOME_DIR}${path.sep}`)

        // Process user config list
        const allowList = new Set(agenticShellConfig?.allow ?? [])
        const blockList = new Set([...BASE_DISALLOWED_COMMANDS, ...(agenticShellConfig?.block ?? [])])

        try {
            // Command validation
            const commandStart = filteredCommand.split(' ')[0]
            if (
                (allowList?.size &&
                    !Array.from(allowList).some(cmd => filteredCommand.startsWith(cmd))) ||
                blockList.has(commandStart)
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
            const errorContent = `Failed to run ${command} in terminal:\n${error}`
            const size = await TokenCounterUtils.countTokens(errorContent)

            return [
                {
                    type: 'file',
                    content: errorContent,
                    title: 'Terminal Output Error',
                    uri: vscode.Uri.file(command),
                    source: ContextItemSource.Terminal,
                    size,
                },
            ]
        }
    })
}

// Pre-defined base disallowed commands
const BASE_DISALLOWED_COMMANDS = [
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
]
