import type { Span } from '@opentelemetry/api'
import {
    type ChatMessage,
    type ContextItem,
    type Message,
    PromptString,
    type ToolContentPart,
    isDefined,
    logDebug,
    ps,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
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
                    turnCount === 0 ? AGENT_MODELS.ExtendedThinking : AGENT_MODELS.Base
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
                const { processedTools, contextItems } = await this.executeTools(toolCalls)

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
        const existingCall = toolCalls.get(toolCall.id)

        // Add new tool call or update if arguments are more complete
        if (
            !existingCall ||
            (existingCall.function.arguments?.length || 0) < (toolCall.function.arguments?.length || 0)
        ) {
            // Merge the existing call (if any) with the new toolCall,
            // prioritizing properties from the new toolCall.  This ensures
            // that status and result are preserved if they exist.
            const updatedCall = { ...existingCall, ...toolCall }
            toolCalls.set(toolCall.id, updatedCall)

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
        toolCalls: ToolContentPart[]
    ): Promise<{ processedTools: ToolContentPart[]; contextItems: ContextItem[] }> {
        try {
            // Execute all tools in parallel
            const results = await Promise.all(
                toolCalls.map(toolCall => this.executeSingleTool(toolCall))
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
        toolCall: ToolContentPart
    ): Promise<{ toolResult: ToolContentPart; contextItems?: ContextItem[] } | null> {
        // Find the appropriate tool
        const tool = this.tools.find(t => t.spec.name === toolCall.function.name)
        if (!tool) return null

        // Update status to pending *before* execution
        toolCall.status = 'pending'

        try {
            const args = parseToolCallArgs(toolCall.function.arguments)
            const output = await tool.invoke(args)

            const toolResult: ToolContentPart = {
                ...toolCall, // Copy existing properties
                status: toolCall.status === 'error' ? 'error' : 'done',
                result: output.text,
            }

            logDebug('AgenticHandler', `Tool execution successful: ${toolCall.function.name}`)
            return { toolResult, contextItems: output.contextItems }
        } catch (error) {
            const toolResult: ToolContentPart = {
                ...toolCall, // Copy existing properties
                status: 'error',
                result: String(error),
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

// A prompter that creates a prompt for an agentic chat model
class AgenticChatPrompter {
    constructor(private readonly preamble: PromptString) {}

    public async makePrompt(chat: ChatBuilder, context: ContextItem[] = []): Promise<Message[]> {
        return wrapInActiveSpan('chat.prompter', async () => {
            const contextWindow = { input: 150000, output: 8000 }
            const promptBuilder = await PromptBuilder.create(contextWindow)

            // Add preamble messages
            const preambleMessages = { speaker: 'system', text: this.preamble } satisfies ChatMessage
            if (!promptBuilder.tryAddToPrefix([preambleMessages])) {
                throw new Error(`Preamble length exceeded context window ${contextWindow.input}`)
            }

            // Add existing chat transcript messages
            const reverseTranscript = [...chat.getDehydratedMessages()].reverse()

            promptBuilder.tryAddMessages(reverseTranscript)

            if (context.length > 0) {
                await promptBuilder.tryAddContext('user', context)
            }

            const historyItems = reverseTranscript
                .flatMap(m => (m.contextFiles ? [...m.contextFiles].reverse() : []))
                .filter(isDefined)

            await promptBuilder.tryAddContext('history', historyItems.reverse())

            return promptBuilder.build()
        })
    }
}
