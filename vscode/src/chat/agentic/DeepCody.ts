import type { Span } from '@opentelemetry/api'
import {
    BotResponseMultiplexer,
    type ChatClient,
    CodyIDE,
    type ContextItem,
    ContextItemSource,
    type Message,
    type ProcessingStep,
    type PromptMixin,
    PromptString,
    clientCapabilities,
    getClientPromptString,
    isDefined,
    logDebug,
    newPromptMixin,
    ps,
    telemetryRecorder,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { getCategorizedMentions, isUserAddedItem } from '../../prompt-builder/utils'
import type { ChatBuilder } from '../chat-view/ChatBuilder'
import { DefaultPrompter } from '../chat-view/prompt'
import type { CodyTool } from './CodyTool'
import { CodyToolProvider, type ToolStatusCallback } from './CodyToolProvider'
import { ProcessManager } from './ProcessManager'
import { ACTIONS_TAGS, CODYAGENT_PROMPTS } from './prompts'

/**
 * A DeepCodyAgent handles advanced context retrieval and analysis for chat interactions.
 * It uses a multi-step process to:
 * 1. Review and analyze existing context
 * 2. Dynamically retrieve additional relevant context using configured tools
 * 3. Filter and validate context items for improved chat responses
 *
 * Key features:
 * - Integrates with multiple CodyTools for context gathering
 * - Uses BotResponseMultiplexer for handling tool responses
 * - Supports telemetry and tracing
 * - Implements iterative context review with configurable max loops
 */
export class DeepCodyAgent {
    public static readonly id = 'deep-cody'
    public static model: string | undefined = undefined

    protected readonly multiplexer = new BotResponseMultiplexer()
    protected readonly promptMixins: PromptMixin[] = []
    protected readonly tools: CodyTool[]
    protected statusCallback: ToolStatusCallback
    private stepsManager: ProcessManager

    protected context: ContextItem[] = []

    constructor(
        protected readonly chatBuilder: ChatBuilder,
        protected readonly chatClient: Pick<ChatClient, 'chat'>,
        statusUpdateCallback: (steps: ProcessingStep[]) => void
    ) {
        // Initialize tools, handlers and mixins in constructor
        this.tools = CodyToolProvider.getTools()

        this.initializeMultiplexer(this.tools)
        this.buildPrompt(this.tools)

        this.stepsManager = new ProcessManager(steps => statusUpdateCallback(steps))

        this.statusCallback = {
            onStart: () => {
                this.stepsManager.initializeStep()
            },
            onStream: (toolName, content) => {
                this.stepsManager.addStep(toolName, content)
            },
            onComplete: (toolName, error) => {
                this.stepsManager.completeStep(toolName, error)
            },
        }
    }

    /**
     * Register the tools with the multiplexer.
     */
    protected initializeMultiplexer(tools: CodyTool[]): void {
        for (const tool of tools) {
            this.multiplexer.sub(tool.config.tags.tag.toString(), {
                onResponse: async (content: string) => tool.stream(content),
                onTurnComplete: async () => {},
            })
        }
    }

    /**
     * Construct the prompt based on the tools available.
     */
    protected buildPrompt(tools: CodyTool[]): void {
        const toolInstructions = tools.map(t => t.getInstruction())
        const prompt = CODYAGENT_PROMPTS.review
            .replace('{{CODY_TOOLS_PLACEHOLDER}}', RawTextProcessor.join(toolInstructions, ps`\n- `))
            .replace(
                '{{CODY_IDE}}',
                getClientPromptString(clientCapabilities().agentIDE || CodyIDE.VSCode)
            )
        // logDebug('Deep Cody', 'buildPrompt', { verbose: prompt })
        this.promptMixins.push(newPromptMixin(prompt))
    }

    /**
     * Retrieves and refines context for the current chat through an iterative review process.
     * The process continues until either:
     * - Maximum loop count is reached
     * - Chat is aborted
     * - No new context items are found
     * - All new items are user-added
     *
     * @param requestID - Unique identifier for the chat request
     * @param chatAbortSignal - Signal to abort the context retrieval
     * @param context - Initial context items
     * @param maxLoops - Maximum number of review iterations (default: 2)
     * @returns Refined and expanded context items for the chat
     */
    public async getContext(
        requestID: string,
        chatAbortSignal: AbortSignal,
        context: ContextItem[],
        maxLoops = 2
    ): Promise<ContextItem[]> {
        this.context = context
        return wrapInActiveSpan('DeepCody.getContext', span =>
            this._getContext(requestID, span, chatAbortSignal, maxLoops)
        )
    }

    private async _getContext(
        requestID: string,
        span: Span,
        chatAbortSignal: AbortSignal,
        maxLoops = 2
    ): Promise<ContextItem[]> {
        span.setAttribute('sampled', true)
        this.statusCallback?.onStart()

        const startTime = performance.now()
        const { stats, contextItems } = await this.reviewLoop(requestID, span, chatAbortSignal, maxLoops)

        telemetryRecorder.recordEvent('cody.deep-cody.context', 'reviewed', {
            privateMetadata: {
                durationMs: performance.now() - startTime,
                ...stats,
                model: DeepCodyAgent.model,
                traceId: span.spanContext().traceId,
            },
            billingMetadata: {
                product: 'cody',
                category: 'billable',
            },
        })

        this.statusCallback?.onComplete()

        return contextItems
    }

    private async reviewLoop(
        requestID: string,
        span: Span,
        chatAbortSignal: AbortSignal,
        maxLoops: number
    ): Promise<{ stats: { context: number; loop: number }; contextItems: ContextItem[] }> {
        span.addEvent('reviewLoop')
        const stats = { context: 0, loop: 0 }
        for (let i = 0; i < maxLoops && !chatAbortSignal.aborted; i++) {
            const newContext = await this.review(requestID, span, chatAbortSignal)
            if (!newContext.length) break

            // Filter and add new context items in one pass
            const validItems = newContext.filter(c => c.title !== 'TOOLCONTEXT')
            this.context.push(...validItems)

            stats.context += validItems.length
            stats.loop++

            if (newContext.every(isUserAddedItem)) break
        }
        return { stats, contextItems: this.context }
    }

    /**
     * Reviews current context and generates new context items using configured tools.
     * The review process:
     * 1. Builds a prompt using current context
     * 2. Processes the prompt through chat client
     * 3. Executes relevant tools based on the response
     * 4. Validates and filters the resulting context items
     *
     * @returns Array of new context items from the review
     */
    private async review(
        requestID: string,
        span: Span,
        chatAbortSignal: AbortSignal
    ): Promise<ContextItem[]> {
        const prompter = this.getPrompter(this.context)
        const promptData = await prompter.makePrompt(this.chatBuilder, 1, this.promptMixins)
        span.addEvent('sendReviewRequest')
        try {
            const res = await this.processStream(
                requestID,
                promptData.prompt,
                chatAbortSignal,
                DeepCodyAgent.model
            )
            // If the response is empty or contains the CONTEXT_SUFFICIENT token, the context is sufficient.
            if (!res) return []
            const results = await Promise.all(
                this.tools.map(async tool => {
                    try {
                        if (chatAbortSignal.aborted) return []
                        return await tool.run(span, this.statusCallback)
                    } catch (error) {
                        this.statusCallback.onComplete(tool.config.tags.tag.toString(), error as Error)
                        return []
                    }
                })
            )

            // If the response is empty or contains the known token, the context is sufficient.
            if (res?.includes(ACTIONS_TAGS.ANSWER.toString())) {
                // Process the response without generating any context items.
                for (const tool of this.tools) {
                    tool.processResponse?.()
                }
            }

            const reviewed = []

            // Extract all the strings from between tags.
            const valid = RawTextProcessor.extract(res, ACTIONS_TAGS.CONTEXT.toString())
            for (const contextName of valid || []) {
                const foundValidatedItems = this.context.filter(c => c.uri.path.endsWith(contextName))
                for (const found of foundValidatedItems) {
                    reviewed.push({ ...found, source: ContextItemSource.Agentic })
                }
            }

            // Replace the current context list with the reviewed context.
            if (valid.length + reviewed.length > 0) {
                reviewed.push(...this.context.filter(c => isUserAddedItem(c)))
                this.context = reviewed
            }

            return results.flat().filter(isDefined)
        } catch (error) {
            await this.multiplexer.notifyTurnComplete()
            logDebug('Deep Cody', `context review failed: ${error}`, {
                verbose: { prompt: promptData.prompt, error },
            })
            return []
        }
    }

    protected async processStream(
        requestID: string,
        message: Message[],
        signal?: AbortSignal,
        model?: string
    ): Promise<string> {
        const stream = await this.chatClient.chat(
            message,
            { model, maxTokensToSample: 4000 },
            new AbortController().signal,
            requestID
        )
        const accumulated = new RawTextProcessor()
        try {
            for await (const msg of stream) {
                if (signal?.aborted) break
                if (msg.type === 'change') {
                    const newText = msg.text.slice(accumulated.length)
                    accumulated.append(newText)
                    await this.multiplexer.publish(newText)
                }

                if (msg.type === 'complete' || msg.type === 'error') {
                    if (msg.type === 'error') throw new Error('Error while streaming')
                    break
                }
            }
        } finally {
            await this.multiplexer.notifyTurnComplete()
        }

        return accumulated.toString()
    }

    protected getPrompter(items: ContextItem[]): DefaultPrompter {
        const { explicitMentions, implicitMentions } = getCategorizedMentions(items)
        const MAX_SEARCH_ITEMS = 30
        return new DefaultPrompter(explicitMentions, implicitMentions.slice(-MAX_SEARCH_ITEMS))
    }
}

/**
 * Handles building and managing raw text returned by LLM with support for:
 * - Incremental string building
 * - XML-style tag content extraction
 * - Length tracking
 * - String joining with custom connectors
 */
export class RawTextProcessor {
    private parts: string[] = []

    public append(str: string): void {
        this.parts.push(str)
    }

    public toString(): string {
        const joined = this.parts.join('')
        this.reset()
        return joined
    }

    public get length(): number {
        return this.parts.reduce((acc, part) => acc + part.length, 0)
    }

    private reset(): void {
        this.parts = []
    }

    public static extract(response: string, tag: string): string[] {
        const tagLength = tag.length
        return (
            response
                .match(new RegExp(`<${tag}>(.*?)<\/${tag}>`, 'g'))
                ?.map(m => m.slice(tagLength + 2, -(tagLength + 3))) || []
        )
    }

    public static join(prompts: PromptString[], connector = ps`\n`) {
        return PromptString.join(prompts, connector)
    }
}
