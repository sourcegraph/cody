import { spawn } from 'node:child_process'
import * as vscode from 'vscode'
import { zodToAnthropicSchema } from '../chat-view/handlers/AgenticAnthropicHandler'
import { type RunTerminalCommandInput, RunTerminalCommandSchema, validateWithZod } from './schema'

interface CommandOptions {
    cwd?: string
    env?: Record<string, string>
}

export interface CommandResult {
    stdout: string
    stderr: string
    code: number | null
    signal: NodeJS.Signals | null
}

class CommandError extends Error {
    constructor(
        message: string,
        public readonly result: CommandResult
    ) {
        super(message)
        this.name = 'CommandError'
    }
}

export const shellTool = {
    spec: {
        name: 'run_terminal_command',
        description: 'Run an arbitrary terminal command at the root of the users project.',
        input_schema: zodToAnthropicSchema(RunTerminalCommandSchema),
    },
    invoke: async (input: RunTerminalCommandInput) => {
        const validInput = validateWithZod(RunTerminalCommandSchema, input, 'run_terminal_command')

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
            throw new Error('No workspace folder found')
        }

        try {
            const commandResult = await runShellCommand(validInput.command, {
                cwd: workspaceFolder.uri.path,
            })
            return commandResult.stdout
        } catch (error) {
            throw new Error(`Failed to run terminal command: ${input.command}: ${error}`)
        }
    },
}

export async function runShellCommand(
    command: string,
    options: CommandOptions = {}
): Promise<CommandResult> {
    const { cwd = process.cwd(), env = process.env } = options
    const timeout = 10_000
    const maxBuffer = 1024 * 1024 * 10
    const encoding = 'utf8'

    return new Promise((resolve, reject) => {
        const process = spawn(command, [], {
            shell: true,
            cwd,
            env,
            windowsHide: true,
        })

        let stdout = ''
        let stderr = ''
        let killed = false
        const timeoutId = setTimeout(() => {
            killed = true
            process.kill()
            reject(new Error(`Command timed out after ${timeout}ms`))
        }, timeout)

        let stdoutLength = 0
        let stderrLength = 0

        process.stdout?.on('data', (data: Buffer) => {
            const chunk = data.toString(encoding)
            stdoutLength += chunk.length
            if (stdoutLength > maxBuffer) {
                killed = true
                process.kill()
                reject(new Error('stdout maxBuffer exceeded'))
                return
            }
            stdout += chunk
        })

        process.stderr?.on('data', (data: Buffer) => {
            const chunk = data.toString(encoding)
            stderrLength += chunk.length
            if (stderrLength > maxBuffer) {
                killed = true
                process.kill()
                reject(new Error('stderr maxBuffer exceeded'))
                return
            }
            stderr += chunk
        })

        process.on('error', (error: Error) => {
            clearTimeout(timeoutId)
            reject(new Error(`Failed to start process: ${error.message}`))
        })

        process.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
            clearTimeout(timeoutId)
            if (killed) return

            const result: CommandResult = { stdout, stderr, code, signal }
            if (code === 0) {
                resolve(result)
            } else {
                reject(
                    new CommandError(
                        `Command failed with exit code ${code}${stderr ? ': ' + stderr : ''}`,
                        result
                    )
                )
            }
        })
    })
}
