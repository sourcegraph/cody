import OpenAI from 'openai'
import type { ChatNetworkClientParams } from '..'
import { type CompletionContentData, getCompletionsModelConfig, isDefined, logDebug } from '../..'
import { contextFiltersProvider } from '../../cody-ignore/context-filters-provider'
import { CompletionStopReason } from '../../inferenceClient/misc'
import { getMessageImageUrl } from '../completions-converter'

interface ToolCall {
    id: string
    name: string
    args: any
}

// Map to track tool calls: toolCallId -> { name, args }
const activeToolCalls = new Map<string, { name: string; args: string }>()

/**
 * Calls the Ollama API for chat completions with history.
 */
export async function openaiChatClient({
    params,
    cb,
    completionsEndpoint,
    logger,
}: ChatNetworkClientParams): Promise<void> {
    const log = logger?.startCompletion(params, completionsEndpoint)

    if (!params.model || !params.messages) {
        throw new Error('No model or messages')
    }

    const config = getCompletionsModelConfig(params.model)
    const model = config?.model ?? params.model
    const endpoint = config?.endpoint

    if (!endpoint || !model) {
        throw new Error('No endpoint')
    }

    // Update the host if it's different from the current one.
    const client = new OpenAI({
        apiKey: config?.key,
        baseURL: endpoint,
    })

    const result = {
        completion: '',
        stopReason: CompletionStopReason.StreamingChunk,
        toolCalls: [] as ToolCall[],
        content: [] as CompletionContentData[],
    }

    try {
        const messages = await Promise.all(
            params.messages.map(async msg => {
                const toolResults = msg.content?.filter(c => c.type === 'tool_result')
                if (toolResults && toolResults.length > 0) {
                    // We will need to flatten the tool results to get the content later
                    return toolResults.map(toolResult => ({
                        role: 'tool' as const,
                        tool_call_id: toolResult.tool_result.id,
                        content: toolResult.tool_result.content,
                    }))
                }
                const images = msg.content
                    ?.filter(c => c.type === 'image_url')
                    ?.map(c => getMessageImageUrl(c).data)
                    ?.filter(isDefined)
                const text =
                    (await msg.text?.toFilteredString(contextFiltersProvider)) ??
                    msg.content?.filter(c => c.type === 'text')?.join(' ')

                return {
                    role:
                        msg.speaker === 'system'
                            ? 'system'
                            : msg.speaker === 'human'
                              ? 'user'
                              : 'assistant',
                    content: text || '',
                    ...(images?.length && { image_url: images }),
                } as OpenAI.ChatCompletionMessageParam
            })
        )

        // Flatten the array of arrays into a single array of messages
        const flattenedMessages = messages.flat() as OpenAI.ChatCompletionMessageParam[]
        const tools = params.tools?.map(t =>
            codyToolToOpenAITool(t.function.parameters, t.function.name, t.function.description)
        )

        const stream = await client.chat.completions.create({
            model,
            messages: flattenedMessages,
            tools,
            temperature: 1,
            stream: true,
        })

        logDebug('OpenAI Client', 'Stream started', { verbose: tools })

        for await (const event of stream) {
            const { delta, finish_reason } = event.choices[0]
            if (delta?.content) {
                result.completion += delta.content
            }

            if (delta?.tool_calls) {
                logDebug('OpenAI Client', 'Tool call delta received', { verbose: event })
                for (const tc of delta.tool_calls) {
                    if (!tc.id) return
                    // Get or create the tool call entry
                    const existing = activeToolCalls.get(tc.id) || {
                        name: tc.function?.name || '',
                        args: '',
                    }
                    // Accumulate the args delta
                    existing.args += tc.function?.arguments || ''
                    activeToolCalls.set(tc.id, existing)

                    // Add to our tracked tool calls for this response
                    const toolCall = {
                        id: tc.id,
                        name: tc.function?.name || existing.name,
                        args: existing.args,
                    }
                    result.toolCalls = result.toolCalls.filter(t => t.id !== tc.id)
                    result.toolCalls.push(toolCall)

                    logDebug('OpenAI Client', `Updated tool call: ${toolCall.name}`, {
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
            }

            cb.onChange(result.completion, result.content)

            if (finish_reason) {
                logDebug('OpenAI Client', 'Stream finished', { verbose: event })
                result.stopReason = CompletionStopReason.RequestFinished
                break
            }
        }
    } catch (e) {
        const error = new Error(`OpenAI Client: ${e}`)
        cb.onError(error, 500)
        log?.onError(error.message)
    } finally {
        cb.onComplete(result)
        log?.onComplete(result)
    }
}

export function codyToolToOpenAITool(schema: any, name: string, description: string): any {
    schema.$schema = undefined
    return {
        type: 'function',
        function: {
            name,
            description,
            parameters: schema,
        },
    }
}
