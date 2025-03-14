import type { Span } from '@opentelemetry/api'
import {
    type ChatMessage,
    type ContextItem,
    type MessagePart,
    PromptString,
    type ToolContentPart,
    logDebug,
} from '@sourcegraph/cody-shared'
import { getCategorizedMentions } from '../../../prompt-builder/utils'
import type { ChatBuilder } from '../ChatBuilder'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'
import { DefaultPrompter } from '../prompt'
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
    // Handler ID
    public static readonly id = 'agentic-chat'

    protected SYSTEM_PROMPT: string

    protected readonly MAX_TURN = 20
    protected tools: AgentTool[] = []
    protected turnCount = 0

    // Store tool execution state globally by conversation
    private static toolExecutionStates = new Map<string, Map<string, ToolContentPart>>()

    constructor(
        contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
        editor: ChatControllerOptions['editor'],
        protected readonly chatClient: ChatControllerOptions['chatClient']
    ) {
        super(contextRetriever, editor, chatClient)
        this.SYSTEM_PROMPT = buildAgentPrompt()
    }

    public async handle(req: AgentRequest, delegate: AgentHandlerDelegate): Promise<void> {
        const sessionID = req.chatBuilder.sessionID

        logDebug('AgenticHandler', `Starting agent session ${sessionID}`, {
            verbose: {
                model: req.model,
                inputLength: req.inputText.toString().length,
            },
        })

        try {
            await this._handle(req, delegate)
        } catch (error) {
            // Log the error to the output channel
            logDebug('AgenticHandler', `Error in agent session ${sessionID}`, {
                verbose:
                    error instanceof Error
                        ? { message: error.message, stack: error.stack }
                        : String(error),
            })

            // Only post error if not aborted
            if (!req.signal.aborted) {
                delegate.postError(
                    error instanceof Error ? error : new Error(String(error)),
                    'transcript'
                )
            }
        } finally {
            // Always ensure we call postDone to close the chat properly
            delegate.postDone()

            logDebug('AgenticHandler', `Ending agent session ${sessionID}`)
        }
    }

    protected async _handle(req: AgentRequest, delegate: AgentHandlerDelegate): Promise<void> {
        const { signal, span, chatBuilder, recorder, model } = req

        // Initialize session state
        const sessionID = chatBuilder.sessionID
        const toolStateMap = this.initializeSessionState(sessionID)

        // Initialize tools
        this.tools = await AgentToolGroup.getToolsByAgentId(this.contextRetriever, span)

        // Post initial empty message for loading state
        delegate.postMessageInProgress({
            speaker: 'assistant',
            model,
        })

        // Main conversation loop
        await this.runConversationLoop(
            chatBuilder,
            delegate,
            recorder,
            span,
            signal,
            model,
            toolStateMap
        )
    }

    /**
     * Initialize the session state for this conversation
     */
    protected initializeSessionState(sessionID: string): Map<string, ToolContentPart> {
        if (!AgenticHandler.toolExecutionStates.has(sessionID)) {
            AgenticHandler.toolExecutionStates.set(sessionID, new Map<string, ToolContentPart>())
        }
        return AgenticHandler.toolExecutionStates.get(sessionID)!
    }

    /**
     * Run the main conversation loop, processing LLM responses and executing tools
     */
    protected async runConversationLoop(
        chatBuilder: AgentRequest['chatBuilder'],
        delegate: AgentHandlerDelegate,
        recorder: AgentRequest['recorder'],
        span: Span,
        signal: AbortSignal,
        model: string,
        toolStateMap: Map<string, ToolContentPart>,
        contextItems: ContextItem[] = []
    ): Promise<void> {
        // Reset turn count for new conversation
        this.turnCount = 0
        let currentContextItems = contextItems

        while (this.turnCount < this.MAX_TURN) {
            signal.throwIfAborted()

            // Process LLM response and extract tool calls
            const { botResponse, toolCalls } = await this.requestLLM(
                currentContextItems,
                chatBuilder,
                delegate,
                recorder,
                span,
                signal,
                model
            ).catch(error => {
                logDebug('AgenticHandler', 'Error in stream', { verbose: error })
                if (!signal.aborted) {
                    delegate.postError(
                        error instanceof Error ? error : new Error(String(error)),
                        'transcript'
                    )
                }
                throw error
            })

            signal.throwIfAborted()

            // If no tool calls, conversation is complete
            if (toolCalls?.length === 0) {
                logDebug('AgenticHandler', 'No tool calls, ending conversation')
                break
            }

            // Add a human message with pending tool state
            this.addPendingToolsMessage(botResponse, toolCalls, chatBuilder, model)

            delegate.postMessageInProgress({
                speaker: 'assistant',
                model,
            })

            // Execute tools and process results
            const { toolResults, contextFiles } = await this.executeTools(toolCalls, toolStateMap).catch(
                error => {
                    logDebug('AgenticHandler', 'Error executing tools', { verbose: error })
                    if (!signal.aborted) {
                        delegate.postError(
                            error instanceof Error ? error : new Error(String(error)),
                            'transcript'
                        )
                    }
                    return { toolResults: [], contextFiles: [] }
                }
            )

            // Update the human message with completed tool results
            this.updateToolResultsMessage(toolResults, contextFiles, chatBuilder)

            // If no tools were executed or we reached max turns, exit loop
            if (!toolResults?.length || this.turnCount === this.MAX_TURN - 1) {
                logDebug('AgenticHandler', 'No tool results or max turns reached, ending conversation')
                break
            }

            this.turnCount++
            currentContextItems = contextFiles
        }
    }
    /**
     * Process LLM response and extract tool calls
     */
    protected async requestLLM(
        contextItems: ContextItem[],
        chatBuilder: AgentRequest['chatBuilder'],
        delegate: AgentHandlerDelegate,
        recorder: AgentRequest['recorder'],
        span: Span,
        signal: AbortSignal,
        model: string
    ): Promise<{ botResponse: ChatMessage; toolCalls: ToolContentPart[] }> {
        // Create a new prompter for each turn
        const sessionID = chatBuilder.sessionID
        const { explicitMentions, implicitMentions } = getCategorizedMentions(contextItems)
        const prompter = new DefaultPrompter(explicitMentions, implicitMentions, false)
        const { prompt } = await this.buildPrompt(prompter, chatBuilder, signal, 8)
        recorder.recordChatQuestionExecuted(contextItems, { addMetadata: true, current: span })

        // Prepare messages for the API call
        const params = {
            maxTokensToSample: 4000,
            messages: prompt,
            system: this.SYSTEM_PROMPT,
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

        // Track tool calls across stream chunks
        const toolCalls = new Map<string, ToolContentPart>()
        const streamed = { text: '' }

        const getBotMessage = () =>
            ({
                speaker: 'assistant',
                text: PromptString.unsafe_fromLLMResponse(streamed.text),
                model,
            }) satisfies ChatMessage

        // Process stream chunks
        const stream = await this.chatClient.chat(prompt, params, signal)
        for await (const message of stream) {
            signal.throwIfAborted()

            switch (message.type) {
                case 'change': {
                    streamed.text = message.text

                    const toolCalled = message.content?.filter(c => c.type === 'function')
                    if (!toolCalled?.length) break
                    for (const toolCall of toolCalled) {
                        this.processToolCall(sessionID, toolCall, toolCalls)
                    }

                    break
                }
            }

            // Update UI with in-progress message
            delegate.postMessageInProgress(getBotMessage())
        }

        // Final update - add message to chat history
        // chatBuilder.addBotMessage(getBotMessage(), model)

        return { botResponse: getBotMessage(), toolCalls: Array.from(toolCalls.values()) }
    }

    /**
     * Process a tool call from the LLM response
     */
    protected processToolCall(
        sessionID: string,
        toolCall: ToolContentPart,
        toolCalls: Map<string, ToolContentPart>
    ): void {
        const toolStateMap = AgenticHandler.toolExecutionStates.get(sessionID)
        if (!toolStateMap) return

        // Track if this is a new tool call
        const isNewToolCall = !toolCalls.has(toolCall.id)

        toolCalls.set(toolCall.id, toolCall)

        if (isNewToolCall) {
            toolStateMap.set(toolCall.id, toolCall)

            logDebug('AgenticHandler', `Tool requested: ${toolCall.function.name}`, {
                verbose: {
                    toolId: toolCall.id,
                    args: toolCall.function.arguments, // This is most likely to be empty.
                },
            })
        }
    }

    /**
     * Execute tools from LLM response
     */
    protected async executeTools(
        toolCalls: ToolContentPart[],
        toolStateMap: Map<string, ToolContentPart>
    ): Promise<{ toolResults: MessagePart[]; contextFiles: ContextItem[] }> {
        // Process all tool calls in parallel for better performance
        const results = await Promise.all(
            toolCalls.map(toolCall => this.executeSingleTool(toolCall, toolStateMap))
        ).catch(error => {
            logDebug('AgenticHandler', 'Error executing tools', { verbose: error })
            return []
        })

        // Consolidate results
        const toolResults: MessagePart[] = []
        const contextFiles: ContextItem[] = []

        for (const result of results) {
            if (result) {
                toolResults.push(result.toolResult)
                if (result.contextItems?.length) {
                    contextFiles.push(...result.contextItems)
                }
            }
        }

        return { toolResults, contextFiles }
    }

    /**
     * Execute a single tool and handle success/failure
     */
    protected async executeSingleTool(
        toolCall: ToolContentPart,
        toolStateMap: Map<string, ToolContentPart>
    ): Promise<{ toolResult: MessagePart; contextItems?: ContextItem[] } | null> {
        // Find the appropriate tool
        const tool = this.tools.find(t => t.spec.name === toolCall.function.name)
        if (!tool) return null

        // Get tool state once and update it to pending
        const toolState = toolStateMap.get(toolCall.id)
        if (toolState) {
            toolState.status = 'pending'
        }

        try {
            // Execute the tool
            const args = parseToolCallArgs(toolCall.function.arguments)
            const output = await tool.invoke(args)

            logDebug('AgenticHandler', `Tool invoked: ${toolCall.function.name}`, {
                verbose: {
                    toolId: toolCall.id,
                    args: toolCall.function.arguments,
                },
            })

            // Update tool state on success
            if (toolState) {
                toolState.status = 'success'
                toolState.result = output.text
            }

            // Return successful result
            return {
                toolResult: {
                    type: 'function',
                    id: toolCall.id,
                    function: { ...toolCall.function },
                    status: 'done',
                    result: output.text,
                },
                contextItems: output.contextItems,
            }
        } catch (error) {
            // Log and handle errors
            logDebug('AgenticHandler', `Failed to invoke ${toolCall.function.name}`, {
                verbose: { error },
            })

            // Update tool state on error
            if (toolState) {
                toolState.status = 'error'
                toolState.result = String(error)
            }

            // Return error result
            return {
                toolResult: {
                    type: 'function',
                    function: { ...toolCall.function },
                    id: toolCall.id,
                    status: 'error',
                    result: String(error),
                },
            }
        }
    }

    /**
     * Add a human message with pending tool results
     */
    protected addPendingToolsMessage(
        botResponse: ChatMessage,
        pendingToolResults: MessagePart[],
        chatBuilder: ChatBuilder,
        model: string
    ): void {
        try {
            // Make sure we have the right alternating pattern
            const lastMessageIndex = chatBuilder.getLastSpeakerMessageIndex('human')
            const lastBotMessageIndex = chatBuilder.getLastSpeakerMessageIndex('assistant')

            if (
                lastMessageIndex !== undefined &&
                (lastBotMessageIndex === undefined || lastBotMessageIndex < lastMessageIndex)
            ) {
                logDebug('AgenticHandler', 'Adding pending tool calls message')

                chatBuilder.addBotMessage(botResponse, model)
            }

            // Add the human message with pending tool status
            chatBuilder.addHumanMessage({
                text: PromptString.unsafe_fromUserQuery(
                    `Calling tools: ${JSON.stringify(pendingToolResults, null, 2)}`
                ),
                content: pendingToolResults,
                model,
            })
        } catch (error) {
            logDebug('AgenticHandler', 'Failed adding pending tool calls', { verbose: error })
        }
    }

    /**
     * Update the tool results in the existing message
     */
    protected updateToolResultsMessage(
        toolResults: MessagePart[],
        contextFiles: ContextItem[],
        chatBuilder: ChatBuilder
    ): void {
        try {
            chatBuilder.setLastMessageContext(contextFiles)
            chatBuilder.setLastMessageContent(toolResults)
        } catch (error) {
            logDebug('AgenticHandler', 'Error updating tool results', { verbose: error })
        }
    }

    /**
     * Static utility methods for managing tool execution state
     */
    public static clearToolStateForSession(sessionID: string): void {
        AgenticHandler.toolExecutionStates.delete(sessionID)
    }
}
