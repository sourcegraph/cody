// import { spawn } from 'node:child_process'
// import type { SpawnOptions } from 'node:child_process'
import type { MessageParam, Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources'
import {
    type ChatClient,
    type ContextItem,
    ProcessType,
    type PromptMixin,
    PromptString,
    type SerializedPromptEditorState,
    currentSiteVersion,
    firstResultFromOperation,
    newPromptMixin,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import type { SubMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { isError } from 'lodash'
import type { z } from 'zod'
import zodToJsonSchema from 'zod-to-json-schema'
import { getCategorizedMentions } from '../../../prompt-builder/utils'
import { type AgentTool, AgentToolGroup } from '../../tools/AgentToolGroup'
import { ChatBuilder } from '../ChatBuilder'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'
import type { HumanInput } from '../context'
import { DefaultPrompter, type PromptInfo } from '../prompt'
import { computeContextAlternatives } from './ChatHandler'
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

// Function to convert Zod schema to Anthropic-compatible InputSchema
export function zodToAnthropicSchema(schema: z.ZodObject<any>): Tool.InputSchema {
    return zodToJsonSchema(schema) as Tool.InputSchema
}

// Helper for tracking processed tool calls
const processedToolNames = new Set<string>()

// We'll keep this empty and populate it in handle() method
let allTools: CodyTool[] = []

export class ExperimentalToolHandler implements AgentHandler {
    private tools: AgentTool[] = []
    constructor(
        private chatClient: Pick<ChatClient, 'chat'>,
        protected contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
        protected readonly editor: ChatControllerOptions['editor']
    ) {}

    protected createToolMixin(tools: CodyTool[]): PromptMixin {
        // Extract instructions from each tool
        const toolInstructions = tools.map(
            tool =>
                `- ${tool.spec.name}: ${tool.spec.description}
             Input schema: ${JSON.stringify(tool.spec.input_schema)}`
        )

        // Create the tool instruction prompt
        const toolPrompt = `
    You have access to the following tools:
    ${toolInstructions.join('\n')}

    When you need to use a tool, use the following format:
    <tool_call>
    {
      "name": "tool_name",
      "input": {
        "param1": "value1",
        "param2": "value2"
      }
    }
    </tool_call>

    Wait for the tool result before continuing.
    `

        // Return as a prompt mixin
        return newPromptMixin(PromptString.unsafe_fromLLMResponse(toolPrompt))
    }

    protected async buildPrompt(
        prompter: DefaultPrompter,
        chatBuilder: ChatBuilder,
        abortSignal: AbortSignal,
        codyApiVersion: number,
        tools: CodyTool[]
    ): Promise<PromptInfo> {
        // Create mixins array, starting with any existing mixins
        const mixins: PromptMixin[] = []

        // Add the tool mixin if we have tools
        if (tools.length > 0) {
            mixins.push(this.createToolMixin(tools))
        }
        const { prompt, context } = await prompter.makePrompt(chatBuilder, codyApiVersion, mixins)

        abortSignal.throwIfAborted()
        chatBuilder.setLastMessageContext([...context.used, ...context.ignored])

        return { prompt, context }
    }

    protected async computeContext(
        _requestID: string,
        { text, mentions }: HumanInput,
        editorState: SerializedPromptEditorState | null,
        _chatBuilder: ChatBuilder,
        _delegate: AgentHandlerDelegate,
        signal?: AbortSignal,
        skipQueryRewrite = false
    ): Promise<{
        contextItems?: ContextItem[]
        error?: Error
        abort?: boolean
    }> {
        try {
            return wrapInActiveSpan('chat.computeContext', async span => {
                const contextAlternatives = await computeContextAlternatives(
                    this.contextRetriever,
                    this.editor,
                    { text, mentions },
                    editorState,
                    span,
                    signal,
                    skipQueryRewrite
                )
                return { contextItems: contextAlternatives[0].items }
            })
        } catch (e) {
            return {
                error: new Error(`Unexpected error computing context, no context was used: ${e}`),
            }
        }
    }

    // Helper method to process messages of any type
    private processMessage(
        message: any,
        toolCalls: ToolCall[],
        subViewTranscript: SubMessage[],
        subTranscript: Array<MessageParam>,
        delegate: AgentHandlerDelegate,
        lastContent: string
    ): void {
        let messageInProgress: SubMessage | undefined

        switch (message.type) {
            case 'change':
                if (message.text) {
                    // Process any tool calls in the text if needed
                    this.processToolCalls(message.text, toolCalls, subViewTranscript)

                    // Now remove any tool call blocks from the message text
                    const cleanedText = message.text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')

                    // Clean up any resulting artifacts (multiple spaces, etc.)
                    message.text = cleanedText.replace(/\s+/g, ' ').trim()

                    messageInProgress = {
                        text: PromptString.unsafe_fromLLMResponse(message.text),
                    }
                    delegate.experimentalPostMessageInProgress([...subViewTranscript, messageInProgress])
                }
                break

            case 'complete':
                this.processToolCalls(message.text, toolCalls, subViewTranscript)
                // Add the final message to transcript if needed
                if (lastContent) {
                    subTranscript.push({
                        role: 'assistant',
                        content: lastContent,
                    })
                }
                break

            case 'error':
                throw new Error(message.error.message)

            case 'content_block_delta':
                if (message.delta?.text && message.id) {
                    messageInProgress = {
                        text: PromptString.unsafe_fromLLMResponse(message.delta.text),
                    }
                    delegate.experimentalPostMessageInProgress([...subViewTranscript, messageInProgress])
                }
                break

            // For any other message types, log them but don't process
            default:
                console.log('Unhandled message type:', message.type)
                break
        }
    }

    // Helper method to extract tool calls from text
    private processToolCalls(
        text: string,
        toolCalls: ToolCall[],
        subViewTranscript: SubMessage[]
    ): void {
        // Look for tool_call format in the text: <tool_call>{ ... }</tool_call>
        const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g
        let match = toolCallRegex.exec(text)

        while (match !== null) {
            try {
                const toolCallContent = match[1].trim()
                const toolCallData = JSON.parse(toolCallContent)

                if (toolCallData.name && toolCallData.input) {
                    // Check if this tool is already in subViewTranscript or processed
                    if (!processedToolNames.has(toolCallData.name)) {
                        const id = crypto.randomUUID()
                        toolCalls.push({
                            id,
                            name: toolCallData.name,
                            input: toolCallData.input,
                        })

                        subViewTranscript.push({
                            step: {
                                id: toolCallData.name,
                                content: `Invoking tool ${toolCallData.name}(${JSON.stringify(
                                    toolCallData.input
                                )})`,
                                state: 'pending',
                                type: ProcessType.Tool,
                            },
                        })

                        // Mark this tool as processed
                        processedToolNames.add(toolCallData.name)
                    }
                }
            } catch (e) {
                // Skip invalid tool call formats
                console.warn('Failed to parse tool call:', e)
            }
            match = toolCallRegex.exec(text)
        }
    }
    public async handle(
        {
            requestID,
            inputText,
            mentions,
            editorState,
            signal,
            chatBuilder,
            recorder,
            span,
        }: AgentRequest,
        delegate: AgentHandlerDelegate
    ): Promise<void> {
        // Reset the processed tools for this new session
        processedToolNames.clear()

        // Load tools from AgentToolGroup, the same way AgenticHandler does
        this.tools = await AgentToolGroup.getToolsByVersion(this.contextRetriever, span)

        // Convert AgentTools to CodyTools (compatible with our existing XML approach)
        allTools = this.tools.map(agentTool => ({
            spec: agentTool.spec,
            invoke: agentTool.invoke,
        }))

        // Log available tools
        console.log(`Loaded ${allTools.length} tools:`, allTools.map(t => t.spec.name).join(', '))

        const maxTurns = 10
        let turns = 0
        const content = inputText.toString().trim()
        if (!content) {
            throw new Error('Input text cannot be empty')
        }
        const subTranscript: Array<MessageParam> = [
            {
                role: 'user',
                content,
            },
        ]
        const subViewTranscript: SubMessage[] = []
        const toolCalls: ToolCall[] = []

        // Track active content blocks by ID
        // const activeContentBlocks = new Map<
        //     string,
        //     { type: string; name?: string; text?: string }
        // >();
        // let messageInProgress: SubMessage | undefined;

        while (true) {
            toolCalls.length = 0 // Clear the array for each iteration
            try {
                const requestID = crypto.randomUUID()
                const contextResult = await this.computeContext(
                    requestID,
                    { text: inputText, mentions },
                    editorState,
                    chatBuilder,
                    delegate,
                    signal
                )

                if (contextResult.error) {
                    delegate.postError(contextResult.error, 'transcript')
                }
                if (contextResult.abort) {
                    delegate.postDone({ abort: contextResult.abort })
                    return
                }
                const corpusContext = contextResult.contextItems ?? []
                signal.throwIfAborted()

                const { explicitMentions, implicitMentions } = getCategorizedMentions(corpusContext)
                const prompter = new DefaultPrompter(explicitMentions, implicitMentions, false)

                const versions = await currentSiteVersion()
                if (isError(versions)) {
                    delegate.postError(versions, 'transcript')
                    return
                }
                const { prompt } = await this.buildPrompt(
                    prompter,
                    chatBuilder,
                    signal,
                    versions.codyAPIVersion,
                    allTools
                )

                const contextWindow = await firstResultFromOperation(
                    ChatBuilder.contextWindowForChat(chatBuilder)
                )

                const stream = await this.chatClient.chat(
                    prompt,
                    {
                        model: 'anthropic::2023-06-01::claude-3.5-sonnet',
                        maxTokensToSample: contextWindow.output,
                    },
                    signal,
                    requestID
                )
                let lastContent = ''

                console.log('Debug - stream created successfully')
                for await (const message of stream) {
                    // Handle message based on type
                    if (typeof message === 'string') {
                        // Handle string messages by parsing them first
                        try {
                            const parsedMessage = JSON.parse(message)
                            this.processMessage(
                                parsedMessage,
                                toolCalls,
                                subViewTranscript,
                                subTranscript,
                                delegate,
                                lastContent
                            )
                            if (parsedMessage.type === 'change' && parsedMessage.text) {
                                lastContent = parsedMessage.text
                            }
                        } catch (e) {
                            // If can't parse as JSON, just log the error
                            console.error('Failed to parse message as JSON:', e)
                        }
                    } else {
                        this.processMessage(
                            message,
                            toolCalls,
                            subViewTranscript,
                            subTranscript,
                            delegate,
                            lastContent
                        )
                        if (message.type === 'change' && message.text) {
                            lastContent = message.text
                        }
                    }
                }

                if (toolCalls.length === 0) {
                    break
                }

                // Process tool calls as before
                const toolResults: ToolResultBlockParam[] = []
                for (const toolCall of toolCalls) {
                    console.log('Debug - Processing tool call:', toolCall)
                    const tool = allTools.find(tool => tool.spec.name === toolCall.name)
                    if (!tool) {
                        console.error('Debug - Tool not found:', toolCall.name)
                        continue
                    }

                    try {
                        const output = await tool.invoke(toolCall.input)
                        console.log('Debug - Tool output:', output)
                        if (!output?.trim()) {
                            console.warn('Debug - Empty tool output for:', toolCall.name)
                            continue
                        }
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolCall.id,
                            content: output,
                        })
                    } catch (error) {
                        console.error('Debug - Error invoking tool:', toolCall.name, error)
                    }
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
            } catch (e) {
                new Error(`Unexpected error computing context, no context was used: ${e}`)
            }
        }
        delegate.postDone()
    }
}
