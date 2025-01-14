import type Anthropic from '@anthropic-ai/sdk'
import type { ContentBlock, MessageParam, Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources'
import { ProcessType, PromptString } from '@sourcegraph/cody-shared'
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
]

export class ExperimentalToolHandler implements AgentHandler {
    constructor(private anthropicAPI: Anthropic) {}

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
        while (true) {
            const toolCalls: ToolCall[] = []
            await new Promise<void>((resolve, reject) => {
                this.anthropicAPI.messages
                    .stream(
                        {
                            tools: allTools.map(tool => tool.spec),
                            max_tokens: 8192,
                            model: 'claude-3-5-sonnet-20241022',
                            messages: subTranscript,
                        },
                        {
                            headers: {
                                'anthropic-dangerous-direct-browser-access': 'true',
                            },
                        }
                    )
                    .on('text', (_textDelta, textSnapshot) => {
                        messageInProgress = {
                            text: PromptString.unsafe_fromLLMResponse(textSnapshot),
                        }
                        delegate.experimentalPostMessageInProgress([
                            ...subViewTranscript,
                            messageInProgress,
                        ])
                    })
                    .on('contentBlock', (contentBlock: ContentBlock) => {
                        switch (contentBlock.type) {
                            case 'tool_use':
                                toolCalls.push({
                                    id: contentBlock.id,
                                    name: contentBlock.name,
                                    input: contentBlock.input,
                                })
                                subViewTranscript.push(
                                    messageInProgress || {
                                        step: {
                                            id: contentBlock.name,
                                            content: `Invoking tool ${
                                                contentBlock.name
                                            }(${JSON.stringify(contentBlock.input)})`,
                                            status: 'pending',
                                            type: ProcessType.Step,
                                        },
                                    }
                                )
                                messageInProgress = undefined
                                break
                            case 'text':
                                subViewTranscript.push({
                                    text: PromptString.unsafe_fromLLMResponse(contentBlock.text),
                                })
                                messageInProgress = undefined
                                break
                        }
                    })
                    .on('end', () => {
                        resolve()
                    })
                    .on('abort', error => {
                        reject(`${error}`)
                    })
                    .on('error', error => {
                        reject(`${error}`)
                    })
                    .on('finalMessage', ({ role, content }: MessageParam) => {
                        subTranscript.push({
                            role,
                            content,
                        })
                    })
            })
            if (toolCalls.length === 0) {
                break
            }
            const toolResults: ToolResultBlockParam[] = []
            for (const toolCall of toolCalls) {
                const tool = allTools.find(tool => tool.spec.name === toolCall.name)
                if (!tool) {
                    continue
                }
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
