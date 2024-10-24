import { spawn } from 'node:child_process'
import {
    type ContextItem,
    ContextItemSource,
    TokenCounterUtils,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { logError } from '../../output-channel-logger'

// const execAsync = promisify(exec)
const config = vscode.workspace.getConfiguration('cody')
const isDisabled = Boolean(config.get('context.shell.disabled'))

const OUTPUT_WRAPPER = `
Terminal output from the \`{command}\` command enclosed between <OUTPUT0412> tags:
<OUTPUT0412>
{output}
</OUTPUT0412>`

// A persistent shell session that maintains state between commands
class PersistentShell {
    private shell: ReturnType<typeof spawn> | null = null
    private buffer = ''

    constructor() {
        this.init()
    }

    private init() {
        const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash'
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath
        this.shell = spawn(shell, [], {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
        })

        this.shell.stdout?.on('data', data => {
            this.buffer += data.toString()
        })

        this.shell.stderr?.on('data', data => {
            this.buffer += data.toString()
        })
    }

    async execute(cmd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const command = sanitizeCommand(cmd)
            if (!this.shell) {
                reject(new Error('Shell not initialized'))
                return
            }

            this.buffer = ''
            this.shell.stdin?.write(command + '\n')

            // Use a unique marker to identify the end of command output
            const endMarker = `__END_OF_COMMAND_${Date.now()}__`
            this.shell.stdin?.write(`echo "${endMarker}"\n`)

            const timeout = 30000 // 30 seconds timeout

            const timeoutId = setTimeout(() => {
                reject(new Error('Command execution timed out'))
                this.dispose() // Kill the frozen shell
                this.init() // Reinitialize the shell
            }, timeout)

            const checkBuffer = () => {
                if (this.buffer.includes(endMarker)) {
                    clearTimeout(timeoutId)
                    const output = this.buffer.split(endMarker)[0].trim()
                    resolve(output)
                } else {
                    setTimeout(checkBuffer, 100)
                }
            }

            checkBuffer()
        })
    }

    public dispose(): void {
        if (this.shell) {
            this.shell.stdin?.end()
            this.shell.stdout?.removeAllListeners()
            this.shell.stderr?.removeAllListeners()
            this.shell.kill()
            this.shell = null
        }
        this.buffer = ''
    }
}

const shell = new PersistentShell()

export async function getContextFileFromShell(command: string): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.command', async () => {
        if (!vscode.env.shell || isDisabled) {
            void vscode.window.showErrorMessage(
                'Shell command is not supported in your current workspace.'
            )
            return []
        }

        try {
            if (commandsNotAllowed.some(cmd => command.startsWith(cmd))) {
                void vscode.window.showErrorMessage('Cody cannot execute this command')
                throw new Error('Cody cannot execute this command')
            }

            const output = await shell.execute(command)
            if (!output || output === '') {
                throw new Error('Empty output')
            }

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

// TODO(bee): allows users to configure the allow list.
const commandsNotAllowed = [
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

function sanitizeCommand(command: string): string {
    // Basic sanitization, should be more comprehensive in production
    return command.trim().replace(/[;&|]/g, '')
}
