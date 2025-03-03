import { PromptString, Typewriter, isAbortErrorOrSocketHangUp, logDebug } from '@sourcegraph/cody-shared'
import { AgentToolGroup } from '../../tools/AgentToolGroup'
import { getToolBlock } from '../../tools/schema'
import { convertContextItemToInlineMessage } from '../../tools/utils'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'
import { AgenticAnthropicHandler } from './AgenticAnthropicHandler'
import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'

interface ToolCall {
    id: string
    name: string
    input: any
}

// Function to convert Zod schema to Gemini-compatible function declaration
export function zodToGeminiFunctionDeclaration(schema: any, name: string, description: string): any {
    return {
        name: name,
        description: description,
        parameters: {
            type: 'object', // Gemini requires type "object" for parameters
            properties: schema, // Nest the schema under "properties"
        },
    }
}

interface GeminiMessage {
    role: 'user' | 'model'
    parts?: {
        text?: string
        functionCall?: { name: string; args: any }
        functionResponse?: { name: string; response: any }[]
    }[]
}

export class AgenticGeminiHandler extends AgenticAnthropicHandler implements AgentHandler {
    protected defaultModelId = 'gemini-2.0-flash'

    constructor(
        contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
        editor: ChatControllerOptions['editor'],
        protected readonly chatClient: ChatControllerOptions['chatClient'],
        private readonly GEMINI_API_KEY = ''
    ) {
        super(contextRetriever, editor, chatClient, GEMINI_API_KEY)
    }

    private static sessionID: string | undefined
    private static messages: GeminiMessage[] = [] // Gemini message format is different from Anthropic's

    public async handle(req: AgentRequest, delegate: AgentHandlerDelegate): Promise<void> {
        const { requestID, inputText, mentions, editorState, chatBuilder, signal, span, model } = req
        // TODO: FIX
        if (chatBuilder.sessionID !== AgenticGeminiHandler.sessionID) {
            AgenticGeminiHandler.sessionID = chatBuilder.sessionID
            AgenticGeminiHandler.messages = [] // Reset messages for new session
        }
        if (signal.aborted) return // Early abort check

        this.tools = await AgentToolGroup.getToolsByVersion(this.contextRetriever, span, 'gemini')

        const contextResult = await this.computeAgenticContext(
            requestID,
            { text: inputText, mentions },
            editorState,
            chatBuilder,
            delegate,
            signal
        )

        if (contextResult.error) delegate.postError(contextResult.error, 'transcript')
        if (signal.aborted) return // Abort check after context
        const contextItems = contextResult.contextItems ?? []
        chatBuilder.setLastMessageContext(contextItems)
        AgenticGeminiHandler.messages.push({
            role: 'user',
            parts: [{ text: convertContextItemToInlineMessage(contextItems) }],
        })
        AgenticGeminiHandler.messages.push({ role: 'model', parts: [{ text: 'Reviewed!' }] })
        delegate.postMessageInProgress({
            speaker: 'assistant',
            model,
        })

        const typewriter = new Typewriter({
            update: content =>
                delegate.postMessageInProgress({
                    speaker: 'assistant',
                    text: PromptString.unsafe_fromLLMResponse(content),
                    model,
                }),
            close: delegate.postDone,
            error: error => {
                logDebug('AgenticGeminiHandler', 'Typewriter error', { verbose: { error } })
                delegate.postError(error, 'transcript')
                delegate.postDone()
                if (isAbortErrorOrSocketHangUp(error)) signal.throwIfAborted()
            },
        })

        const streamContent: string[] = []
        const postUpdate = () => typewriter.update(streamContent.join(''))

        AgenticGeminiHandler.messages.push({ role: 'user', parts: [{ text: inputText.toString() }] }) // Gemini message format

        const streamProcessor = async (): Promise<ToolCall[]> => {
            const toolCalls: ToolCall[] = []

            // Convert AgentTool specs to Gemini functionDeclarations format
            const geminiTools = {
                functionDeclarations: this.tools.map(tool =>
                    zodToGeminiFunctionDeclaration(
                        tool.spec.input_schema.properties,
                        tool.spec.name,
                        tool.spec.description ?? ''
                    )
                ),
            }

            const geminiRequestBody = {
                contents: AgenticGeminiHandler.messages,
                tools: [geminiTools],
                toolConfig: {
                    functionCallingConfig: {
                        mode: 'auto',
                    },
                },
            }

            logDebug('AgenticGeminiHandler', 'Request sent', { verbose: geminiRequestBody }) // ADD THIS LOGGING

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${this.defaultModelId}:generateContent?key=${this.GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(geminiRequestBody),
                    signal, // Use the signal to allow aborting the request
                }
            )

            if (!response.ok) {
                const errorDetails = await response.text()
                throw new Error(
                    `Gemini API request failed with status ${response.status}: ${errorDetails}`
                )
            }

            const data = await response.json()
            // Gemini's response structure needs to be parsed to extract text and function calls.
            if (data.candidates?.[0].content?.parts) {
                const parts = data.candidates[0].content.parts
                AgenticGeminiHandler.messages.push({ role: 'model', parts })
                for (const part of parts) {
                    if (part.functionCall) {
                        const functionCall = part.functionCall
                        toolCalls.push({
                            id: 'gemini-tool-call-' + toolCalls.length, // Generate ID as Gemini might not provide one
                            name: functionCall.name,
                            input: functionCall.args,
                        })
                        streamContent.push(
                            getToolBlock({
                                // Adapt getToolBlock if needed for Gemini format
                                type: 'tool_use',
                                id: 'gemini-tool-call-' + toolCalls.length,
                                name: functionCall.name,
                                input: functionCall.args,
                            })
                        )
                    } else if (part.text) {
                        streamContent.push(part.text)
                    } else {
                        logDebug('AgenticGeminiHandler', 'Unexpected part type in Gemini response', {
                            verbose: { part },
                        })
                    }
                }
            } else {
                logDebug('AgenticGeminiHandler', 'Unexpected response structure from Gemini API', {
                    verbose: { data },
                })
                streamContent.push('Error: Unexpected response from Gemini API.') // Handle unexpected response gracefully
            }
            postUpdate() // Update typewriter content after processing the response
            return toolCalls
        }

        while (this.turnCount < this.MAX_TURN) {
            const currentToolCalls = await streamProcessor().catch(error => {
                logDebug('AgenticGeminiHandler', 'Error in stream', { verbose: error })
                if (!signal.aborted) delegate.postError(error, 'transcript') // Prevent double error posting on abort
                return [] // Treat stream error as no tool calls to avoid infinite loop, and allow graceful exit.
            })

            if (signal.aborted) return // Abort check after stream processing

            if (currentToolCalls.length === 0) break

            const toolResults: any[] = [] // Gemini uses a different format for tool results
            for (const toolCall of currentToolCalls) {
                const tool = this.tools.find(t => t.spec.name === toolCall.name)
                if (!tool) continue
                try {
                    const output = await tool.invoke(toolCall.input)
                    toolResults.push({
                        functionResponse: {
                            name: toolCall.name,
                            response: {
                                content: output, // Gemini expects content to be under 'response.content'
                            },
                        },
                    })
                } catch (error) {
                    toolResults.push({
                        functionResponse: {
                            name: toolCall.name,
                            response: {
                                content: String(error),
                            },
                        },
                    }) // Ensure content is always string
                    logDebug('AgenticGeminiHandler', 'Error invoking tool', { verbose: { error } })
                }
            }

            // Format tool results for Gemini in the next turn's message
            const geminiToolResultMessages = toolResults.map(
                result =>
                    ({
                        // Tool results are sent back as 'user' role in Gemini
                        role: 'user',
                        // Gemini expects functionResponse within parts
                        parts: [{ functionResponse: result.functionResponse }],
                    }) satisfies GeminiMessage
            )

            AgenticGeminiHandler.messages.push(...geminiToolResultMessages) // Add tool results to messages for the next turn

            this.turnCount++
        }

        if (this.turnCount >= this.MAX_TURN) {
            console.warn('Max agent turns reached.') // Use warn for non-critical issue
        }
        typewriter.close() // Ensure typewriter is closed after max turns or normal exit.
    }
}
