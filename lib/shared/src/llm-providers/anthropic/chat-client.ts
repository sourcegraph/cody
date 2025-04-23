import Anthropic from '@anthropic-ai/sdk'
import type { ContentBlock, MessageParam, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { ChatNetworkClientParams } from '..'
import {
    CompletionStopReason,
    type TextContentPart,
    contextFiltersProvider,
    getCompletionsModelConfig,
    logDebug,
} from '../..'

interface ToolCall {
    id: string
    name: string
    input: any
}

interface ToolCallContent {
    type: 'tool_call'
    tool_call: {
        id: string
        name: string
        arguments: string
    }
}

export async function anthropicChatClient({
    params,
    cb,
    completionsEndpoint,
    logger,
    signal,
}: ChatNetworkClientParams): Promise<void> {
    const log = logger?.startCompletion(params, completionsEndpoint)
    if (!params.model || !params.messages) {
        throw new Error('Anthropic Client: No model or messages')
    }

    const config = getCompletionsModelConfig(params.model)
    const model = config?.model ?? params.model
    const apiKey = config?.key
    if (!apiKey) {
        throw new Error('Anthropic Client: No API key')
    }

    const anthropic = new Anthropic({ apiKey })
    const result = {
        completion: '',
        stopReason: CompletionStopReason.StreamingChunk,
        toolCalls: [] as ToolCall[],
        content: [] as (TextContentPart | ToolCallContent)[],
    }

    try {
        const messages = (await Promise.all(
            params.messages.map(async msg => {
                // Handle both text and complex content formats
                if (msg.content) {
                    // Transform any 'tool_call' content blocks to 'tool_use' for Anthropic API
                    // And transform any 'tool_result' blocks to have tool_use_id
                    const transformedContent = Array.isArray(msg.content)
                        ? msg.content.map(item => {
                              if (item.type === 'tool_call') {
                                  logDebug('AnthropicChatClient', 'Converting tool_call to tool_use', {
                                      verbose: item,
                                  })
                                  // Create a new object without the original tool_call property
                                  const toolUse = {
                                      type: 'tool_use',
                                      id:
                                          item.tool_call?.id ||
                                          `tool_${Date.now()}_${Math.random()
                                              .toString(36)
                                              .substring(2, 9)}`,
                                      name: item.tool_call?.name,
                                      input: (() => {
                                          try {
                                              return item.tool_call?.arguments
                                                  ? JSON.parse(item.tool_call.arguments)
                                                  : {}
                                          } catch (e) {
                                              logDebug(
                                                  'AnthropicChatClient',
                                                  `Error parsing tool call arguments: ${e}`,
                                                  { verbose: item.tool_call }
                                              )
                                              return item.tool_call?.arguments || {}
                                          }
                                      })(),
                                  }
                                  logDebug('AnthropicChatClient', 'Converted to tool_use format', {
                                      verbose: toolUse,
                                  })
                                  return toolUse
                              }

                              if (item.type === 'tool_result' && item.tool_result) {
                                  // Handle nested tool_result structure
                                  logDebug(
                                      'AnthropicChatClient',
                                      'Converting nested tool_result format',
                                      {
                                          verbose: item,
                                      }
                                  )

                                  // Get the ID from the tool_result object
                                  const toolResultId = item.tool_result.id || ''

                                  // Create a proper tool_result with tool_use_id
                                  const toolResult = {
                                      type: 'tool_result',
                                      tool_use_id: toolResultId,
                                      content: item.tool_result.content,
                                  }
                                  logDebug(
                                      'AnthropicChatClient',
                                      'Converted to Anthropic tool_result format',
                                      {
                                          verbose: toolResult,
                                      }
                                  )
                                  return toolResult
                              }

                              return item
                          })
                        : msg.content

                    return {
                        role: msg.speaker === 'human' ? 'user' : 'assistant',
                        content: transformedContent,
                    }
                }
                return {
                    role: msg.speaker === 'human' ? 'user' : 'assistant',
                    content: (await msg.text?.toFilteredString(contextFiltersProvider)) ?? '',
                }
            })
        )) as MessageParam[]

        // Turns the first assistant message into a system prompt if it exists
        const systemPrompt = messages[0]?.role !== 'user' ? messages.shift()?.content : ''

        // Configure message creation options
        const messageOptions: any = {
            model,
            messages,
            max_tokens: params.maxTokensToSample || 8000,
            temperature: params.temperature,
            top_k: params.topK,
            top_p: params.topP,
            stop_sequences: params.stopSequences,
            stream: config?.stream || true,
            system: `${systemPrompt}`,
        }

        // Filter out any unsupported options before adding the rest
        // Anthropic doesn't support 'categories' parameter
        if (config?.options) {
            const { categories, ...safeOptions } = config.options
            Object.assign(messageOptions, safeOptions)
        }

        // Add tools if provided in params
        if (params.tools) {
            logDebug('AnthropicChatClient', 'Adding tools to request', { verbose: params.tools })

            // Format tools according to Anthropic API requirements
            // Each tool needs a name, description, and input_schema
            const formattedTools = params.tools.map(tool => ({
                name: tool.function.name,
                description: tool.function.description || '',
                input_schema: {
                    type: 'object',
                    properties: tool.function.parameters?.properties || {},
                    required: tool.function.parameters?.required || [],
                },
            }))

            messageOptions.tools = formattedTools
        }

        // Process the stream using the event-based API
        const toolCalls: ToolCall[] = []

        try {
            // Return a Promise that resolves when the stream is complete
            await new Promise<void>((resolve, reject) => {
                // Use event-based stream processing
                anthropic.messages
                    .stream(messageOptions)
                    .on('text', (textDelta, textSnapshot) => {
                        result.completion += textDelta

                        // Update the content array in the result
                        result.content = [
                            { type: 'text' as const, text: result.completion },
                            ...toolCalls.map(toolCall => ({
                                type: 'tool_call' as const,
                                tool_call: {
                                    id: toolCall.id,
                                    name: toolCall.name,
                                    arguments: JSON.stringify(toolCall.input),
                                },
                            })),
                        ]

                        cb.onChange(result.completion, result.content)
                    })
                    .on('thinking', thinking => {
                        // Handle thinking content
                        result.completion += thinking
                        cb.onChange(result.completion, result.content)
                    })
                    .on('contentBlock', (contentBlock: ContentBlock) => {
                        // Process tool use content blocks
                        if (contentBlock.type === 'tool_use') {
                            const toolUseBlock = contentBlock as ToolUseBlock
                            const toolCall = {
                                id: toolUseBlock.id,
                                name: toolUseBlock.name || '',
                                input: toolUseBlock.input,
                            }

                            // Add tool call to our tracked tools
                            toolCalls.push(toolCall)

                            // Update the content array in the result
                            result.content = [
                                { type: 'text' as const, text: result.completion },
                                ...toolCalls.map(tc => ({
                                    type: 'tool_call' as const,
                                    tool_call: {
                                        id: tc.id,
                                        name: tc.name,
                                        arguments: JSON.stringify(tc.input),
                                    },
                                })),
                            ]

                            cb.onChange(result.completion, result.content)
                        }
                    })
                    .on('streamEvent', (streamEvent: any) => {
                        if (signal?.aborted) {
                            result.stopReason = CompletionStopReason.RequestAborted
                            resolve()
                        }

                        // Handle thinking blocks (from extended thinking models)
                        // Use optional chaining and type checking to safely access properties
                        if (
                            streamEvent.type === 'content_block_start' &&
                            streamEvent.content_block &&
                            streamEvent.content_block.type === 'thinking'
                        ) {
                            result.completion += '<think>'
                            cb.onChange(result.completion, result.content)
                        }

                        if (
                            streamEvent.type === 'content_block_delta' &&
                            streamEvent.content_block &&
                            streamEvent.content_block.type === 'thinking' &&
                            streamEvent.delta &&
                            typeof streamEvent.delta.text === 'string'
                        ) {
                            result.completion += streamEvent.delta.text
                            cb.onChange(result.completion, result.content)
                        }

                        if (
                            streamEvent.type === 'content_block_stop' &&
                            streamEvent.content_block &&
                            streamEvent.content_block.type === 'thinking'
                        ) {
                            result.completion += '</think>'
                            cb.onChange(result.completion, result.content)
                        }
                    })
                    .on('finalMessage', ({ role, content }: MessageParam) => {
                        // Store final message if needed
                        logDebug('AnthropicChatClient', 'Received final message', {
                            verbose: { role, content },
                        })
                    })
                    .on('end', () => {
                        // Stream is complete - resolve the Promise
                        result.stopReason = CompletionStopReason.RequestFinished
                        resolve()
                    })
                    .on('error', error => {
                        logDebug('AnthropicChatClient', 'Error in stream', { verbose: error })
                        reject(error)
                    })
                    .on('abort', () => {
                        result.stopReason = CompletionStopReason.RequestAborted
                        resolve()
                    })
            })
        } catch (streamError) {
            logDebug('AnthropicChatClient', 'Error processing stream', { verbose: streamError })
            // Continue with any tool calls we've collected so far
        }

        // Store tool calls in the result
        result.toolCalls = toolCalls

        // Prepare the final result with content array
        const finalResult = {
            ...result,
            content: [
                { type: 'text' as const, text: result.completion },
                ...toolCalls.map(toolCall => ({
                    type: 'tool_call' as const,
                    tool_call: {
                        id: toolCall.id,
                        name: toolCall.name,
                        arguments: JSON.stringify(toolCall.input),
                    },
                })),
            ],
        }

        // Report the final completion
        cb.onComplete(finalResult)
        log?.onComplete(finalResult)
    } catch (e) {
        const error = new Error(`Anthropic Client Failed: ${e}`)
        cb.onError(error, 500)
        log?.onError(error.message)
    }
}
