import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import {
    tool as AiTool,
    type CoreAssistantMessage,
    type CoreMessage,
    type CoreSystemMessage,
    type CoreToolMessage,
    type CoreUserMessage,
    type ImagePart,
    type TextPart,
    type Tool,
    type ToolSet,
    jsonSchema,
    streamText,
} from 'ai'
import type { ChatNetworkClientParams } from '..'
import {
    type CompletionContentData,
    type Message,
    type MessagePart,
    getCompletionsModelConfig,
    logDebug,
} from '../..'
import { contextFiltersProvider } from '../../cody-ignore/context-filters-provider'
import { CompletionStopReason } from '../../inferenceClient/misc'
import { getMessageImageUrl } from '../completions-converter'

// Map to track tool calls: toolCallId -> { name, args }
const activeToolCalls = new Map<string, { name: string; args: string }>()

interface ToolCall {
    id: string
    name: string
    args: any
}

/**
 * Chat client for OpenAI-compatible models.
 */
export async function llmChatClient({
    params,
    cb,
    completionsEndpoint,
    logger,
    signal,
}: ChatNetworkClientParams): Promise<void> {
    if (!params.model || !params.messages) {
        throw new Error('No model or messages')
    }

    const config = getCompletionsModelConfig(params.model)
    const model = config?.model ?? params.model
    const baseURL = config?.endpoint
    const apiKey = config?.key

    if (!baseURL) {
        throw new Error('Missing endpoint info')
    }

    const log = logger?.startCompletion(params, baseURL)

    // Store original fetch for later restoration
    const originalFetch = global.fetch

    // Update the host if it's different from the current one.
    const llm = createOpenAICompatible({
        name: 'llm',
        apiKey,
        baseURL,
    })

    const result = {
        completion: '',
        stopReason: CompletionStopReason.StreamingChunk,
        toolCalls: [] as ToolCall[],
        content: [] as CompletionContentData[],
    }

    try {
        const messages: CoreMessage[] = await buildCoreMessages(params.messages)

        // ToolSet = Record<string, Tool>
        const tools: ToolSet = {}

        for (const tool of params.tools ?? []) {
            if (tool.function.name && tool.function.description && tool.function.parameters) {
                // Remove  "additionalProperties" & "$schema" from the schema
                tool.function.parameters.additionalProperties = undefined
                tool.function.parameters.$schema = undefined

                const convertedTool = AiTool({
                    description: tool.function.description,
                    parameters: jsonSchema(tool.function.parameters),
                } satisfies Tool)

                tools[tool.function.name] = convertedTool
            }
        }

        const response = streamText({
            model: llm(model),
            messages,
            temperature: 1,
            // tools,
            onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
                // your own logic, e.g. for saving the chat history or recording usage
                logDebug('llmChatClient', 'Step finish', {
                    verbose: { text, toolCalls, toolResults, finishReason, usage },
                })
            },
            onError(error) {
                logDebug('llmChatClient', 'Error from provider', { verbose: error })
                console.log('Error from provider', error)
                cb.onError(new Error(JSON.stringify(error)), 400)
            },
        })

        for await (const part of response.fullStream) {
            switch (part.type) {
                case 'text-delta': {
                    console.log('Text delta:', part.textDelta)
                    break
                }

                case 'tool-call-delta': {
                    console.log('Tool call delta:', part)
                    if (part.toolCallId) {
                        // Get or create the tool call entry
                        const existing = activeToolCalls.get(part.toolCallId) || {
                            name: part.toolName || '',
                            args: '',
                        }
                        // Accumulate the args delta
                        existing.args += part.argsTextDelta || ''
                        activeToolCalls.set(part.toolCallId, existing)

                        // Add to our tracked tool calls for this response
                        const toolCall = {
                            id: part.toolCallId,
                            name: part.toolName || existing.name,
                            args: existing.args,
                        }
                        result.toolCalls = result.toolCalls.filter(t => t.id !== part.toolCallId)
                        result.toolCalls.push(toolCall)

                        logDebug('llmChatClient', `Updated tool call: ${toolCall.name}`, {
                            verbose: {
                                toolCall,
                                activeToolCalls: Array.from(activeToolCalls.entries()),
                            },
                        })

                        // Update the content array in the result
                        result.content = [
                            { type: 'text' as const, text: result.completion },
                            ...Array.from(activeToolCalls.entries()).map(([id, tool]) => ({
                                type: 'tool_call' as const,
                                tool_call: {
                                    id,
                                    name: tool.name,
                                    arguments: tool.args,
                                },
                            })),
                        ]
                    }

                    break
                }

                case 'tool-call': {
                    if (part.toolCallId) {
                        // Get or create the tool call entry
                        const existing = activeToolCalls.get(part.toolCallId) || {
                            name: part.toolName || '',
                            args: '',
                        }
                        // Accumulate the args delta
                        existing.args += part.args || ''
                        activeToolCalls.set(part.toolCallId, existing)

                        // Add to our tracked tool calls for this response
                        const toolCall = {
                            id: part.toolCallId,
                            name: part.toolName || existing.name,
                            args: existing.args,
                        }
                        result.toolCalls = result.toolCalls.filter(t => t.id !== part.toolCallId)
                        result.toolCalls.push(toolCall)

                        logDebug('llmChatClient', `Updated tool call: ${toolCall.name}`, {
                            verbose: {
                                toolCall,
                                activeToolCalls: Array.from(activeToolCalls.entries()),
                            },
                        })

                        // Update the content array in the result
                        result.content = [
                            { type: 'text' as const, text: result.completion },
                            ...Array.from(activeToolCalls.entries()).map(([id, tool]) => ({
                                type: 'tool_call' as const,
                                tool_call: {
                                    id,
                                    name: tool.name,
                                    arguments: tool.args,
                                },
                            })),
                        ]
                    }

                    break
                }

                case 'finish': {
                    console.log('Finish reason:', part.finishReason)
                    console.log('Usage:', part.usage)
                    break
                }

                case 'error':
                    console.error('Error:', part.error)
                    break
            }

            cb.onChange(result.completion, result.content)

            if (signal?.aborted) {
                result.stopReason = CompletionStopReason.RequestAborted
                break
            }
        }

        // Final update to result.content if any text was streamed without tool calls
        if (result.completion && (!result.content.length || result.content[0]?.type !== 'text')) {
            result.content = [
                { type: 'text' as const, text: result.completion },
                ...result.content.filter(c => c.type !== 'text'),
            ]
        }
    } catch (e) {
        const error = new Error(`Custom Chat Client Failed: ${e}`)
        cb.onError(error, 500)
        log?.onError(error.message)
    } finally {
        // Restore the original fetch function
        global.fetch = originalFetch

        cb.onComplete(result)
        log?.onComplete(result)
    }
}

/**
 * Builds core messages from the input messages.
 */
async function buildCoreMessages(messages: Message[]): Promise<CoreMessage[]> {
    return Promise.all(
        messages.map(async msg => {
            const content = []

            const text = (await msg.text?.toFilteredString(contextFiltersProvider)) ?? ''
            const textContent: TextPart = { type: 'text', text }
            if (text) {
                content.push(textContent)
            }
            const images = msg.content
                ?.filter((c: MessagePart) => c.type === 'image_url')
                ?.map((c: MessagePart) => getMessageImageUrl(c))

            for (const image of images ?? []) {
                const { mimeType, data } = image
                if (mimeType && data) {
                    content.push({
                        type: 'image',
                        image: data,
                        mimeType,
                    } satisfies ImagePart)
                }
            }

            if (msg.speaker === 'system') {
                return {
                    role: 'system',
                    content: text,
                } satisfies CoreSystemMessage
            }

            if (msg.speaker === 'human') {
                const toolResults = msg.content?.filter((c: MessagePart) => c.type === 'tool_result')
                if (toolResults?.length) {
                    return {
                        role: 'tool',
                        content: toolResults.map(
                            (c: { tool_result: { id: string; content: string } }) => ({
                                type: 'tool-result',
                                toolCallId: c.tool_result.id,
                                toolName:
                                    activeToolCalls.get(c.tool_result.id)?.name ?? c.tool_result.id,
                                result: c.tool_result.content,
                            })
                        ),
                    } satisfies CoreToolMessage
                }

                return {
                    role: 'user',
                    content,
                } as CoreUserMessage
            }

            return {
                role: 'assistant',
                content,
            } as CoreAssistantMessage
        })
    )
}

export function toolsConverter(tools: any[]): ToolSet {
    // ToolSet = Record<string, Tool>
    const toolSet: ToolSet = {}

    logDebug('llmChatClient', 'Input tools format', { verbose: { inputTools: tools } })

    for (const tool of tools ?? []) {
        if (tool.function.name && tool.function.description && tool.function.parameters) {
            // Remove  "additionalProperties" & "$schema" from the schema
            tool.function.parameters.additionalProperties = undefined
            tool.function.parameters.$schema = undefined

            const convertedTool = AiTool({
                description: tool.function.description,
                parameters: jsonSchema(tool.function.parameters),
            } satisfies Tool)

            toolSet[tool.function.name] = convertedTool
            logDebug('llmChatClient', `Converted tool: ${tool.function.name}`, {
                verbose: { convertedTool },
            })
        }
    }

    return toolSet
}
