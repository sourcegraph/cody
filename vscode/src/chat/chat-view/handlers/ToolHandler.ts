import { spawn } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import type { MessageParam, Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources'
import { type ChatClient, ProcessType, PromptString } from '@sourcegraph/cody-shared'
import type { SubMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import * as vscode from 'vscode'
import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'

interface CodyTool {
    spec: Tool
    invoke: (input: any) => Promise<string>
}

interface ToolCall {
    id: string
    name: string
    input: any
}

const allTools: CodyTool[] = [
    {
        spec: {
            name: 'get_file',
            description: 'Get the file contents.',
            input_schema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The path to the file.',
                    },
                },
                required: ['path'],
            },
        },
        invoke: async (input: { path: string }) => {
            // check if input is of type string
            if (typeof input.path !== 'string') {
                throw new Error(`get_file argument must be a string, value was ${JSON.stringify(input)}`)
            }
            const { path: relativeFilePath } = input
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
                if (!workspaceFolder) {
                    throw new Error('No workspace folder found')
                }
                const uri = vscode.Uri.joinPath(workspaceFolder.uri, relativeFilePath)

                const content = await vscode.workspace.fs.readFile(uri)
                return Buffer.from(content).toString('utf-8')
            } catch (error) {
                throw new Error(`Failed to read file ${input.path}: ${error}`)
            }
        },
    },
    {
        spec: {
            name: 'run_terminal_command',
            description: 'Run an arbitrary terminal command at the root of the users project. ',
            input_schema: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description:
                            'The command to run in the root of the users project. Must be shell escaped.',
                    },
                },
                required: ['command'],
            },
        },
        invoke: async (input: { command: string }) => {
            if (typeof input.command !== 'string') {
                throw new Error(
                    `run_terminal_command argument must be a string, value was ${JSON.stringify(input)}`
                )
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
            if (!workspaceFolder) {
                throw new Error('No workspace folder found')
            }

            try {
                const commandResult = await runShellCommand(input.command, {
                    cwd: workspaceFolder.uri.path,
                })
                return commandResult.stdout
            } catch (error) {
                throw new Error(`Failed to run terminal command: ${input.command}: ${error}`)
            }
        },
    },
]

export class ExperimentalToolHandler implements AgentHandler {
    constructor(private chatClient: Pick<ChatClient, 'chat'>) {}

    public async handle({ inputText }: AgentRequest, delegate: AgentHandlerDelegate): Promise<void> {
        const maxTurns = 10
        let turns = 0
        const subTranscript: Array<MessageParam> = [
            {
                role: 'user',
                content: inputText.toString(),
            },
        ]
        const subViewTranscript: SubMessage[] = []
        let messageInProgress: SubMessage | undefined

        // Track active content blocks by ID
        const activeContentBlocks = new Map<string, { type: string; name?: string; text?: string }>()
        const toolCalls: ToolCall[] = []

        // Define the event processing function
        const processEvent = (data: any) => {
            switch (data.type) {
                case 'content_block_start':
                    if (data.content_block) {
                        const block = data.content_block
                        activeContentBlocks.set(block.id, {
                            type: block.type,
                            name: block.name,
                            text: '',
                        })

                        if (block.type === 'tool_use') {
                            toolCalls.push({
                                id: block.id,
                                name: block.name,
                                input: block.input,
                            })

                            subViewTranscript.push({
                                step: {
                                    id: block.name,
                                    content: `Invoking tool ${block.name}(${JSON.stringify(
                                        block.input
                                    )})`,
                                    state: 'pending',
                                    type: ProcessType.Tool,
                                },
                            })
                            messageInProgress = undefined
                        }
                    }
                    break
                // Handle content block updates (text deltas)
                case 'content_block_delta':
                    if (data.delta?.text) {
                        const block = activeContentBlocks.get(data.id)
                        if (block) {
                            block.text = (block.text || '') + data.delta.text
                            messageInProgress = {
                                text: PromptString.unsafe_fromLLMResponse(block.text),
                            }
                            delegate.experimentalPostMessageInProgress([
                                ...subViewTranscript,
                                messageInProgress,
                            ])
                        }
                    }
                    break
                // Handle content block stop events
                case 'content_block_stop':
                    if (data.content_block) {
                        const blockId = data.content_block.id
                        const block = activeContentBlocks.get(blockId)

                        if (block && block.type === 'text' && block.text) {
                            // Finalize text block by adding it to transcript
                            subViewTranscript.push({
                                text: PromptString.unsafe_fromLLMResponse(block.text),
                            })

                            // Clear messageInProgress after adding to transcript
                            return undefined
                        }

                        // Remove from active blocks
                        activeContentBlocks.delete(blockId)
                    }
                    break
                // Handle text event (backward compatibility)
                case 'text':
                    if (data.textSnapshot) {
                        messageInProgress = {
                            text: PromptString.unsafe_fromLLMResponse(data.textSnapshot),
                        }
                        delegate.experimentalPostMessageInProgress([
                            ...subViewTranscript,
                            messageInProgress,
                        ])
                    }
                    break
                // Handle contentBlock event (backward compatibility)
                case 'contentBlock':
                    if (data.contentBlock) {
                        const contentBlock = data.contentBlock
                        switch (contentBlock.type) {
                            case 'tool_use':
                                toolCalls.push({
                                    id: contentBlock.id,
                                    name: contentBlock.name,
                                    input: contentBlock.input,
                                })
                                subViewTranscript.push({
                                    step: {
                                        id: contentBlock.name,
                                        content: `Invoking tool ${contentBlock.name}(${JSON.stringify(
                                            contentBlock.input
                                        )})`,
                                        state: 'pending',
                                        type: ProcessType.Tool,
                                    },
                                })
                                return undefined // Clear messageInProgress

                            case 'text':
                                subViewTranscript.push({
                                    text: PromptString.unsafe_fromLLMResponse(contentBlock.text),
                                })
                                return undefined // Clear messageInProgress
                        }
                    }
                    break
            }
        }

        while (true) {
            toolCalls.length = 0 // Clear the array for each iteration

            try {
                const requestID = crypto.randomUUID()
                const abortController = new AbortController()

                const message = [
                    {
                        speaker: 'human' as const,
                        messages: subTranscript,
                        stream: true,
                        model: 'anthropic::2023-06-01::claude-3.5-sonnet',
                        max_tokens: 8192,
                        tools: allTools.map(tool => tool.spec),
                    },
                ]

                const generator = await this.chatClient.chat(
                    message,
                    {
                        model: 'anthropic::2023-06-01::claude-3.5-sonnet',
                        maxTokensToSample: 8192,
                    },
                    abortController.signal,
                    requestID
                )

                // Iterate through the async generator
                for await (const data of generator) {
                    if (typeof data === 'string') {
                        try {
                            const parsedData = JSON.parse(data)
                            processEvent(parsedData)
                        } catch (e) {
                            console.error('Failed to parse event data:', e)
                        }
                    } else {
                        processEvent(data)
                    }
                }

                // When the generator completes, add the final message to transcript
                const finalMessage = await generator.next()
                if (!finalMessage.done && finalMessage.value) {
                    if (finalMessage.value.type === 'change') {
                        subTranscript.push({
                            role: 'assistant',
                            content: finalMessage.value.text,
                        })
                    } else if (finalMessage.value.type === 'error') {
                        throw new Error(finalMessage.value.error.message)
                    }
                }
            } catch (error) {
                console.error('Error in chat handling:', error)
            }

            if (toolCalls.length === 0) {
                break
            }

            // Process tool calls as before
            const toolResults: ToolResultBlockParam[] = []
            for (const toolCall of toolCalls) {
                const tool = allTools.find(tool => tool.spec.name === toolCall.name)
                if (!tool) continue

                const output = await tool.invoke(toolCall.input)
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolCall.id,
                    content: output,
                })
            }

            subTranscript.push({
                role: 'user',
                content: toolResults,
            })

            turns++
            if (turns > maxTurns) {
                console.error('Max turns reached')
                break
            }
        }

        delegate.postDone()
    }
}

interface CommandOptions {
    cwd?: string
    env?: Record<string, string>
}

interface CommandResult {
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

async function runShellCommand(command: string, options: CommandOptions = {}): Promise<CommandResult> {
    const { cwd = process.cwd(), env = process.env } = options

    const timeout = 10_000
    const maxBuffer = 1024 * 1024 * 10
    const encoding = 'utf8'
    const spawnOptions: SpawnOptions = {
        shell: true,
        cwd,
        env,
        windowsHide: true,
    }

    return new Promise((resolve, reject) => {
        const process = spawn(command, [], spawnOptions)

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

        if (process.stdout) {
            process.stdout.on('data', (data: Buffer) => {
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
        }

        if (process.stderr) {
            process.stderr.on('data', (data: Buffer) => {
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
        }

        process.on('error', (error: Error) => {
            if (timeoutId) clearTimeout(timeoutId)
            reject(new Error(`Failed to start process: ${error.message}`))
        })

        process.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
            if (timeoutId) clearTimeout(timeoutId)
            if (killed) return

            const result: CommandResult = {
                stdout,
                stderr,
                code,
                signal,
            }

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
