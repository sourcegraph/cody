import type { Span } from '@opentelemetry/api'
import {
    type ChatMessage,
    type ContextItem,
    type Message,
    type MessagePart,
    PromptString,
    type ToolCallContentPart,
    type ToolResultContentPart,
    isDefined,
    logDebug,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { forkSignal } from '../../../completions/utils'
import { PromptBuilder } from '../../../prompt-builder'
import type { ChatBuilder } from '../ChatBuilder'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'
import { type AgentTool, AgentToolGroup } from '../tools'
import { parseToolCallArgs } from '../utils/parse'
import { ChatHandler } from './ChatHandler'
import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'
import { buildAgentPrompt } from './prompts'

enum AGENT_MODELS {
    ExtendedThinking = 'anthropic::2024-10-22::claude-3-7-sonnet-extended-thinking',
    Base = 'anthropic::2024-10-22::claude-3-7-sonnet-latest',
}

/**
 * Base AgenticHandler class that manages tool execution state
 * and implements the core agentic conversation loop
 */
export class AgenticHandler extends ChatHandler implements AgentHandler {
    public static readonly id = 'agentic-chat'
    protected readonly SYSTEM_PROMPT: PromptString
    protected readonly MAX_TURN = 50

    protected tools: AgentTool[] = []

    constructor(
        contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
        editor: ChatControllerOptions['editor'],
        protected readonly chatClient: ChatControllerOptions['chatClient']
    ) {
        super(contextRetriever, editor, chatClient)
        this.SYSTEM_PROMPT = PromptString.unsafe_fromUserQuery(buildAgentPrompt())
    }

    public async handle(req: AgentRequest, delegate: AgentHandlerDelegate): Promise<void> {
        const { chatBuilder, span, recorder, signal } = req
        const sessionID = chatBuilder.sessionID

        // Initialize available tools
        this.tools = await AgentToolGroup.getToolsByAgentId(this.contextRetriever, span)

        logDebug('AgenticHandler', `Starting agent session ${sessionID}`)

        try {
            // Run the main conversation loop
            await this.runConversationLoop(chatBuilder, delegate, recorder, span, signal)
        } catch (error) {
            this.handleError(sessionID, error, delegate, signal)
        } finally {
            delegate.postDone()
            logDebug('AgenticHandler', `Ending agent session ${sessionID}`)
        }
    }

    /**
     * Run the main conversation loop, processing LLM responses and executing tools
     */
    protected async runConversationLoop(
        chatBuilder: ChatBuilder,
        delegate: AgentHandlerDelegate,
        recorder: AgentRequest['recorder'],
        span: Span,
        signal: AbortSignal
    ): Promise<void> {
        let turnCount = 0
        const abortController = forkSignal(signal || new AbortController().signal)

        // Main conversation loop
        while (turnCount < this.MAX_TURN && !signal.aborted) {
            const model = turnCount === 0 ? AGENT_MODELS.ExtendedThinking : AGENT_MODELS.Base

            try {
                // Get LLM response
                const { botResponse, toolCalls } = await this.requestLLM(
                    chatBuilder,
                    delegate,
                    recorder,
                    span,
                    abortController.signal,
                    model
                )

                // Add bot response to conversation
                delegate.postMessageInProgress(botResponse)

                const content = Array.from(toolCalls.values())

                // No tool calls means we're done
                if (!toolCalls?.size) {
                    chatBuilder.addBotMessage(botResponse, model)
                    logDebug('AgenticHandler', 'No tool calls, ending conversation')
                    break
                }

                // Execute tools and update results
                const toolResults = await this.executeTools(content)

                for (const toolResult of toolResults) {
                    // Find the tool call that corresponds to this result
                    const idx = botResponse.content?.findIndex(
                        c => c.type === 'tool_call' && c.tool_call.id === toolResult.tool_result.id
                    )
                    const toolCall = idx && idx !== -1 ? botResponse.content?.[idx] : undefined
                    // Update the tool call with the result
                    if (toolCall) {
                        const toolCallPart = toolCall as ToolCallContentPart
                        toolCallPart.result = { status: 'done', ...toolResult }
                    }
                }
                // Add the tool result to the chat
                chatBuilder.addBotMessage(botResponse, model)

                // Add a human message to hold tool results
                chatBuilder.addHumanMessage({
                    content: toolResults,
                    intent: 'agentic',
                })

                // Exit if max turns reached
                if (turnCount >= this.MAX_TURN - 1) {
                    logDebug('AgenticHandler', 'Max turns reached, ending conversation')
                    break
                }

                turnCount++
            } catch (error) {
                this.handleError(chatBuilder.sessionID, error, delegate, signal)
                break
            }
        }
    }

    /**
     * Request a response from the LLM with tool calling capabilities
     */
    protected async requestLLM(
        chatBuilder: ChatBuilder,
        delegate: AgentHandlerDelegate,
        recorder: AgentRequest['recorder'],
        span: Span,
        signal: AbortSignal,
        model: string
    ): Promise<{ botResponse: ChatMessage; toolCalls: Map<string, ToolCallContentPart> }> {
        // Create prompt
        const prompter = new AgenticChatPrompter(this.SYSTEM_PROMPT)
        const prompt = await prompter.makePrompt(chatBuilder)
        recorder.recordChatQuestionExecuted([], { addMetadata: true, current: span })

        // Prepare API call parameters
        const params = {
            maxTokensToSample: 8000,
            messages: JSON.stringify(prompt),
            tools: this.tools.map(tool => ({
                type: 'function',
                function: {
                    name: tool.spec.name,
                    description: tool.spec.description,
                    parameters: tool.spec.input_schema,
                },
            })),
            stream: true,
            model,
        }

        // Initialize state
        const toolCalls = new Map<string, ToolCallContentPart>()
        const streamed: MessagePart = { type: 'text', text: '' }
        const content: MessagePart[] = []

        // Process stream
        const stream = await this.chatClient.chat(prompt, params, signal)
        for await (const message of stream) {
            if (signal.aborted) break

            switch (message.type) {
                case 'change': {
                    streamed.text = message.text
                    delegate.postMessageInProgress({
                        speaker: 'assistant',
                        content: [streamed],
                        text: PromptString.unsafe_fromLLMResponse(streamed.text),
                        model,
                    })
                    // Process tool calls in the response
                    const toolCalledParts = message?.content?.filter(c => c.type === 'tool_call') || []
                    for (const toolCall of toolCalledParts) {
                        this.syncToolCall(toolCall, toolCalls)
                    }
                    break
                }
                case 'error': {
                    throw message.error
                }
                case 'complete': {
                    content.push(streamed)
                    break
                }
            }
        }

        // Create final response

        if (toolCalls.size > 0) {
            content.push(...Array.from(toolCalls.values()))
        }

        return {
            botResponse: {
                speaker: 'assistant',
                intent: 'agentic',
                content,
                model,
                text: streamed.text ? PromptString.unsafe_fromLLMResponse(streamed.text) : undefined,
            },
            toolCalls,
        }
    }

    /**
     * Process and sync tool calls
     */
    protected syncToolCall(
        toolCall: ToolCallContentPart,
        toolCalls: Map<string, ToolCallContentPart>
    ): void {
        const existingCall = toolCalls.get(toolCall?.tool_call?.id)
        if (!existingCall) {
            logDebug('AgenticHandler', `Calling ${toolCall?.tool_call?.name}`, { verbose: toolCall })
        }
        // Merge the existing call (if any) with the new toolCall,
        // prioritizing properties from the new toolCall.  This ensures
        // that status and result are preserved if they exist.
        const updatedCall = { ...existingCall, ...toolCall }
        toolCalls.set(toolCall?.tool_call?.id, updatedCall)
    }

    /**
     * Execute tools from LLM response
     */
    protected async executeTools(toolCalls: ToolCallContentPart[]): Promise<ToolResultContentPart[]> {
        try {
            logDebug('AgenticHandler', `Executing ${toolCalls.length} tools`)
            // Execute all tools concurrently
            const toolResults = await Promise.all(
                toolCalls.map(async toolCall => {
                    logDebug('AgenticHandler', `Executing ${toolCall.tool_call?.name}`, {
                        verbose: toolCall,
                    })
                    return this.executeSingleTool(toolCall)
                })
            )

            return toolResults.filter(isDefined)
        } catch (error) {
            logDebug('AgenticHandler', 'Error executing tools', { verbose: error })
            return []
        }
    }

    /**
     * Execute a single tool and handle success/failure
     */
    protected async executeSingleTool(
        toolCall: ToolCallContentPart
    ): Promise<ToolResultContentPart | undefined> {
        // Find the appropriate tool
        const tool = this.tools.find(t => t.spec.name === toolCall.tool_call.name)
        if (!tool) return undefined

        const toolResult: ToolResultContentPart = {
            type: 'tool_result',
            tool_result: {
                id: toolCall.tool_call.id,
                content: '',
            },
        }

        // Update status to pending *before* execution
        try {
            const args = parseToolCallArgs(toolCall.tool_call.arguments)
            const output = await tool.invoke(args)

            toolResult.tool_result.content = output.text

            logDebug('AgenticHandler', `Executed ${toolCall.tool_call.name}`, { verbose: output })

            return toolResult
        } catch (error) {
            toolResult.tool_result.content = String(error)
            logDebug('AgenticHandler', `${toolCall.tool_call.name} failed`, { verbose: error })
            return toolResult
        }
    }

    /**
     * Handle errors with consistent logging and reporting
     */
    private handleError(
        sessionID: string,
        error: unknown,
        delegate: AgentHandlerDelegate,
        signal: AbortSignal
    ): void {
        logDebug('AgenticHandler', `Error in agent session ${sessionID}`, {
            verbose:
                error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
        })

        // Only post error if not aborted
        if (!signal.aborted) {
            delegate.postError(error instanceof Error ? error : new Error(String(error)), 'transcript')
        }
    }
}

// TEMPORARY CONTEXT WINDOW
const contextWindow = { input: 180000, output: 8000 }

// A prompter that creates a prompt for an agentic chat model
class AgenticChatPrompter {
    private readonly preamble: ChatMessage
    constructor(preamble: PromptString) {
        this.preamble = { speaker: 'system', text: preamble }
    }

    public async makePrompt(chat: ChatBuilder, context: ContextItem[] = []): Promise<Message[]> {
        return wrapInActiveSpan('AgenticChat.prompter', async () => {
            const promptBuilder = await PromptBuilder.create(contextWindow)

            // Add preamble messages
            if (!promptBuilder.tryAddToPrefix([this.preamble])) {
                throw new Error(`Preamble length exceeded context window ${contextWindow.input}`)
            }

            // Add existing chat transcript messages
            const transcript = chat.getDehydratedMessages()
            const reversedTranscript = [...transcript].reverse()

            promptBuilder.tryAddMessages(reversedTranscript)

            if (context.length > 0) {
                await promptBuilder.tryAddContext('user', context)
            }

            const historyItems = reversedTranscript
                .flatMap(m => (m.contextFiles ? [...m.contextFiles].reverse() : []))
                .filter(isDefined)

            await promptBuilder.tryAddContext('history', historyItems.reverse())

            return promptBuilder.build()
        })
    }
}
