import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatNetworkClientParams } from '..'
import {
    type CompletionContentData,
    CompletionStopReason,
    type ToolCallContentPart,
    getCompletionsModelConfig,
    logDebug,
} from '../..'
import { constructGeminiChatMessages, formatGoogleFunctionDeclarations } from './utils'

/**
 * Interface for tool calls in Google's format
 */
interface GoogleToolCall {
    id: string
    name: string
    args: any
}

/**
 * The URL for the Gemini API, which is used to interact with the Generative Language API provided by Google.
 * The `{model}` placeholder should be replaced with the specific model being used.
 */
// const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}'

/**
 * NOTE: Behind `chat.dev.models` configuration flag for internal dev testing purpose only!
 *
 * Calls the Google API for chat completions with history.
 * REF: https://ai.google.dev/tutorials/rest_quickstart#multi-turn_conversations_chat
 */
export async function googleChatClient({
    params,
    cb,
    completionsEndpoint,
    logger,
    signal,
}: ChatNetworkClientParams): Promise<void> {
    if (!params.model) {
        return
    }

    const config = getCompletionsModelConfig(params.model)
    if (!config?.key) {
        cb.onError(new Error(`API key must be provided to use Google Chat model ${params.model}`))
        return
    }

    const completionResponse = {
        completion: '',
        stopReason: CompletionStopReason.StreamingChunk,
        toolCalls: [] as ToolCallContentPart[],
        content: [] as CompletionContentData[],
    }
    const log = logger?.startCompletion(params, completionsEndpoint)
    try {
        signal?.throwIfAborted()
        const genAI = new GoogleGenerativeAI(config.key)

        // Configure model options
        const modelOptions: any = {
            model: config.model,
            generationConfig: {
                ...config.options,
                categories: undefined,
            },
        }

        // Add tools if provided
        if (params.tools && params.tools.length > 0) {
            logDebug('GoogleChatClient', 'Adding tools to request', { verbose: params.tools })

            // Format tools according to Google API requirements
            const functionDeclarations = formatGoogleFunctionDeclarations(params.tools)

            if (functionDeclarations.length > 0) {
                modelOptions.tools = [
                    {
                        functionDeclarations,
                    },
                ]

                logDebug('GoogleChatClient', 'Formatted function declarations', {
                    verbose: functionDeclarations,
                })
            }
        }

        const model = genAI.getGenerativeModel(modelOptions)

        // Construct the messages array for the API and extract system instruction
        const { contents, systemInstruction } = await constructGeminiChatMessages(params.messages)

        // Get the last message for the current request
        const lastMessage = contents.length > 0 ? contents[contents.length - 1] : null
        const history = contents.slice(0, -1)

        if (!lastMessage) {
            return
        }

        // Configure chat options with history and system instruction
        const chatOptions: any = {
            history: history
                .filter(m => m.parts.length > 0)
                .map(m => ({
                    role: m.role,
                    parts: m.parts,
                })),
        }

        // Add system instruction if present
        if (systemInstruction) {
            chatOptions.systemInstruction = systemInstruction
            logDebug('GoogleChatClient', 'Added system instruction to chat', {
                verbose: systemInstruction,
            })
        }

        const chat = model.startChat(chatOptions)

        // Track tool calls
        const toolCalls: GoogleToolCall[] = []

        const result = await chat.sendMessageStream(lastMessage.parts)
        for await (const chunk of result.stream) {
            if (signal?.aborted) {
                completionResponse.stopReason = CompletionStopReason.RequestAborted
                signal.throwIfAborted()
            }

            const chunkText = chunk?.text()
            completionResponse.completion += chunkText

            // Check for function calls in the response
            if (chunk?.candidates?.[0]?.content?.parts) {
                for (const part of chunk.candidates[0].content.parts) {
                    if (part.functionCall) {
                        logDebug('GoogleChatClient', 'Detected function call in response', {
                            verbose: part.functionCall,
                        })

                        // Generate a unique ID for this tool call
                        const toolCallId = `tool_${Date.now()}_${Math.random()
                            .toString(36)
                            .substring(2, 9)}`

                        // Add to our tracked tool calls
                        const toolCall = {
                            id: toolCallId,
                            name: part.functionCall.name,
                            args: part.functionCall.args,
                        }
                        toolCalls.push(toolCall)

                        // Update the content array in the result
                        completionResponse.content = [
                            { type: 'text', text: completionResponse.completion },
                            ...toolCalls.map(tc => ({
                                type: 'tool_call' as const,
                                tool_call: {
                                    id: tc.id,
                                    name: tc.name,
                                    arguments: JSON.stringify(tc.args),
                                },
                            })),
                        ]
                    }
                }
            }

            // Update the content and tool calls in the response
            completionResponse.content = [
                { type: 'text' as const, text: completionResponse.completion },
                ...toolCalls.map(tc => ({
                    type: 'tool_call' as const,
                    tool_call: {
                        id: tc.id,
                        name: tc.name,
                        arguments: JSON.stringify(tc.args),
                    },
                })),
            ]

            cb.onChange(completionResponse.completion, completionResponse.content)

            if (chunk?.candidates?.[0]?.finishReason) {
                completionResponse.stopReason = CompletionStopReason.RequestFinished
                break
            }
        }
    } catch (error) {
        cb.onError(
            error instanceof Error ? error : new Error(`googleChatClient stream failed: ${error}`),
            500
        )
    } finally {
        cb.onComplete(completionResponse)
        log?.onComplete(completionResponse)
    }
}
