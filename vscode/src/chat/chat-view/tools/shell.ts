import { spawn } from 'node:child_process'
import { type UITerminalLine, UITerminalOutputType, UIToolStatus } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { AgentTool, AgentToolResult } from '.'
import { validateWithZod } from '../utils/input'
import { zodToolSchema } from '../utils/parse'
import { type RunTerminalCommandInput, RunTerminalCommandSchema } from './schema'

interface CommandOptions {
    cwd?: string
    env?: Record<string, string>
}

export interface CommandResult {
    command: string
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

export const shellTool: AgentTool = {
    spec: {
        name: 'run_terminal_command',
        description: 'Run an arbitrary terminal command at the root of the users project.',
        input_schema: zodToolSchema(RunTerminalCommandSchema),
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

            // Format the output as an array of TerminalLine objects
            const lines: UITerminalLine[] = [
                { content: validInput.command, type: UITerminalOutputType.Input },
                ...formatOutputToTerminalLines(commandResult.stdout, UITerminalOutputType.Output),
                ...formatOutputToTerminalLines(commandResult.stderr, UITerminalOutputType.Error),
            ].filter(line => line.content.trim() !== '')

            return {
                text: `Executed ${validInput.command}\n\nOutput:\n${commandResult.stdout}${
                    commandResult.stderr ? '\nErrors:\n' + commandResult.stderr : ''
                }`,
                output: {
                    type: 'terminal-output',
                    status: UIToolStatus.Done,
                    query: validInput.command,
                    output: lines,
                },
            } satisfies AgentToolResult
        } catch (error) {
            if (error instanceof CommandError) {
                // Format the error output as an array of TerminalLine objects
                const lines: UITerminalLine[] = [
                    { content: validInput.command, type: UITerminalOutputType.Input },
                    {
                        content: `Exited with code ${error.result.code}`,
                        type: UITerminalOutputType.Error,
                    },
                    ...formatOutputToTerminalLines(error.result.stdout, UITerminalOutputType.Output),
                    ...formatOutputToTerminalLines(error.result.stderr, UITerminalOutputType.Error),
                ].filter(line => line.content.trim() !== '')

                return {
                    text: `Command: ${validInput.command}\n\nExited with code ${
                        error.result.code
                    }\n\nOutput:\n${error.result.stdout}${
                        error.result.stderr ? '\nErrors:\n' + error.result.stderr : ''
                    }`,
                    output: {
                        type: 'terminal-output',
                        status: UIToolStatus.Error,
                        query: validInput.command,
                        output: lines,
                    },
                }
            }
            throw new Error(`Failed to run terminal command: ${input.command}: ${error}`)
        }
    },
}

/**
 * Formats a string output into an array of TerminalLine objects
 */
function formatOutputToTerminalLines(output: string, type: UITerminalOutputType): UITerminalLine[] {
    if (!output) {
        return []
    }

    return output.split('\n').map(line => ({
        content: line,
        type: type === 'error' ? UITerminalOutputType.Error : UITerminalOutputType.Output,
    }))
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

            const result: CommandResult = { command, stdout, stderr, code, signal }
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
