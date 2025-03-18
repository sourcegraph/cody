import type { Span } from '@opentelemetry/api'
import {
    type ChatMessage,
    type ContextItem,
    PromptString,
    type ToolContentPart,
    logDebug,
    ps,
} from '@sourcegraph/cody-shared'
import { AgenticChatPrompter } from '../AgenticChatPrompter'
import type { ChatBuilder } from '../ChatBuilder'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'
import { type AgentTool, AgentToolGroup } from '../tools'
import { parseToolCallArgs } from '../utils/parse'
import { ChatHandler } from './ChatHandler'
import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'
import { buildAgentPrompt } from './prompts'

/**
 * Base AgenticHandler class that manages tool execution state
 * and implements the core agentic conversation loop
 */
export class AgenticHandler extends ChatHandler implements AgentHandler {
    public static readonly id = 'agentic-chat'
    protected readonly SYSTEM_PROMPT: PromptString
    protected readonly MAX_TURN = 20

    protected tools: AgentTool[] = []

    private toolStateMap = new Map<string, ToolContentPart>()

    constructor(
        contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
        editor: ChatControllerOptions['editor'],
        protected readonly chatClient: ChatControllerOptions['chatClient']
    ) {
        super(contextRetriever, editor, chatClient)
        this.SYSTEM_PROMPT = PromptString.unsafe_fromUserQuery(buildAgentPrompt())
    }

    public async handle(req: AgentRequest, delegate: AgentHandlerDelegate): Promise<void> {
        const { chatBuilder, model, span, recorder, signal } = req
        const sessionID = chatBuilder.sessionID

        const toolStateMap = this.toolStateMap

        // Initialize available tools
        this.tools = await AgentToolGroup.getToolsByAgentId(this.contextRetriever, span)

        logDebug('AgenticHandler', `Starting agent session ${sessionID}`, {
            verbose: {
                model,
                inputLength: req.inputText.toString().length,
            },
        })

        try {
            // Run the main conversation loop
            await this.runConversationLoop(
                chatBuilder,
                delegate,
                recorder,
                span,
                signal,
                model,
                toolStateMap
            )
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
        signal: AbortSignal,
        model: string,
        toolStateMap: Map<string, ToolContentPart>
    ): Promise<void> {
        let turnCount = 0

        // Main conversation loop
        while (turnCount < this.MAX_TURN && !signal.aborted) {
            try {
                // Get LLM response
                const { botResponse, toolCalls } = await this.requestLLM(
                    chatBuilder,
                    delegate,
                    recorder,
                    span,
                    signal,
                    model
                )

                // Add bot response to conversation
                chatBuilder.addBotMessage(botResponse, model)

                // No tool calls means we're done
                if (!toolCalls?.length) {
                    logDebug('AgenticHandler', 'No tool calls, ending conversation')
                    break
                }

                // Add a human message to hold tool results
                chatBuilder.addHumanMessage({
                    text: ps`Results`,
                    content: toolCalls,
                    intent: 'agentic',
                })

                // Execute tools and update results
                const { processedTools, contextItems } = await this.executeTools(toolCalls, toolStateMap)

                // Update tool results in the message
                for (const tool of processedTools) {
                    chatBuilder.appendHumanToolPart(tool)
                }

                // Add context if any was found
                if (contextItems.length > 0) {
                    chatBuilder.setLastMessageContext(contextItems)
                }

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
    ): Promise<{ botResponse: ChatMessage; toolCalls: ToolContentPart[] }> {
        // Create prompt
        const prompter = new AgenticChatPrompter(this.SYSTEM_PROMPT)
        const prompt = await prompter.makePrompt(chatBuilder)
        recorder.recordChatQuestionExecuted([], { addMetadata: true, current: span })

        // Prepare API call parameters
        const params = {
            maxTokensToSample: 8000,
            messages: prompt,
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
        const toolCalls = new Map<string, ToolContentPart>()
        let streamedText = ''

        // Process stream
        const stream = await this.chatClient.chat(prompt, params, signal)

        for await (const message of stream) {
            if (signal.aborted) break

            switch (message.type) {
                case 'change': {
                    streamedText = message.text
                    delegate.postMessageInProgress({
                        speaker: 'assistant',
                        text: PromptString.unsafe_fromLLMResponse(streamedText),
                        model,
                    })

                    // Process tool calls in the response
                    const toolCalledParts = message.content?.filter(c => c.type === 'function') || []
                    for (const toolCall of toolCalledParts) {
                        this.updateToolCall(chatBuilder.sessionID, toolCall, toolCalls)
                    }
                    break
                }
                case 'error': {
                    throw message.error
                }
            }
        }

        // Create final response
        return {
            botResponse: {
                speaker: 'assistant',
                text: PromptString.unsafe_fromLLMResponse(streamedText),
                model,
                content: Array.from(toolCalls.values()),
            },
            toolCalls: Array.from(toolCalls.values()),
        }
    }

    /**
     * Process and track a tool call
     */
    protected updateToolCall(
        sessionID: string,
        toolCall: ToolContentPart,
        toolCalls: Map<string, ToolContentPart>
    ): void {
        const toolStateMap = this.toolStateMap

        const existingCall = toolCalls.get(toolCall.id)

        // Add new tool call or update if arguments are more complete
        if (
            !existingCall ||
            (existingCall.function.arguments?.length || 0) < (toolCall.function.arguments?.length || 0)
        ) {
            toolCalls.set(toolCall.id, toolCall)
            toolStateMap.set(toolCall.id, toolCall)

            logDebug(
                'AgenticHandler',
                `${existingCall ? 'Updated' : 'New'} tool call: ${toolCall.function.name}`,
                {
                    verbose: {
                        toolId: toolCall.id,
                        args: toolCall.function.arguments,
                        sessionID,
                    },
                }
            )
        }
    }

    /**
     * Execute tools from LLM response
     */
    protected async executeTools(
        toolCalls: ToolContentPart[],
        toolStateMap: Map<string, ToolContentPart>
    ): Promise<{ processedTools: ToolContentPart[]; contextItems: ContextItem[] }> {
        try {
            // Execute all tools in parallel
            const results = await Promise.all(
                toolCalls.map(toolCall => this.executeSingleTool(toolCall, toolStateMap))
            )

            // Gather results and context
            const processedTools: ToolContentPart[] = []
            const contextItems: ContextItem[] = []

            for (const result of results) {
                if (result) {
                    processedTools.push(result.toolResult)
                    if (result.contextItems?.length) {
                        contextItems.push(...result.contextItems)
                    }
                }
            }

            return { processedTools, contextItems }
        } catch (error) {
            logDebug('AgenticHandler', 'Error executing tools', { verbose: error })
            return { processedTools: [], contextItems: [] }
        }
    }

    /**
     * Execute a single tool and handle success/failure
     */
    protected async executeSingleTool(
        toolCall: ToolContentPart,
        toolStateMap: Map<string, ToolContentPart>
    ): Promise<{ toolResult: ToolContentPart; contextItems?: ContextItem[] } | null> {
        // Find the appropriate tool
        const tool = this.tools.find(t => t.spec.name === toolCall.function.name)
        // Update tool state to pending
        const toolState = toolStateMap.get(toolCall.id)
        if (!tool || !toolState) return null

        toolState.status = 'pending'

        try {
            // Execute the tool
            const args = parseToolCallArgs(toolCall.function.arguments)
            const output = await tool.invoke(args)

            // Create success result
            const toolResult: ToolContentPart = {
                type: 'function',
                id: toolCall.id,
                function: { ...toolCall.function },
                status: 'done',
                result: output.text,
            }

            // Update shared state
            if (toolState) {
                toolState.status = 'done'
                toolState.result = output.text
            }

            logDebug('AgenticHandler', `Tool execution successful: ${toolCall.function.name}`)
            return { toolResult, contextItems: output.contextItems }
        } catch (error) {
            // Create error result
            const toolResult: ToolContentPart = {
                type: 'function',
                id: toolCall.id,
                function: { ...toolCall.function },
                status: 'error',
                result: String(error),
            }

            // Update shared state
            if (toolState) {
                toolState.status = 'error'
                toolState.result = String(error)
            }

            logDebug('AgenticHandler', `Tool execution failed: ${toolCall.function.name}`, {
                verbose: { error },
            })
            return { toolResult }
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
