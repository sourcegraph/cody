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
import { getContextFromRelativePath } from '../../commands/context/file-path'
import { forkSignal } from '../../completions/utils'
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
    /**
     * NOTE: Currently A/B test to default to 3.5 Haiku / 3.5 Sonnet for the review step.
     */
    public static model: string | undefined = undefined

    protected readonly multiplexer = new BotResponseMultiplexer()
    protected readonly promptMixins: PromptMixin[] = []
    protected readonly tools: CodyTool[]
    protected statusCallback: ToolStatusCallback
    private stepsManager: ProcessManager

    protected context: ContextItem[] = []
    /**
     * Context stats during the review:
     * - context: how many context was fetched via tools.
     * - loop: how many loop was run.
     */
    private stats = { context: 0, loop: 0 }

    constructor(
        protected readonly chatBuilder: ChatBuilder,
        protected readonly chatClient: Pick<ChatClient, 'chat'>,
        statusUpdateCallback: (steps: ProcessingStep[]) => void,
        postRequest: (step: ProcessingStep) => Promise<boolean>
    ) {
        // Initialize tools, handlers and mixins in constructor
        this.tools = CodyToolProvider.getTools()
        this.initializeMultiplexer(this.tools)
        this.buildPrompt(this.tools)

        this.stepsManager = new ProcessManager(
            steps => statusUpdateCallback(steps),
            step => postRequest(step)
        )

        this.statusCallback = {
            onUpdate: (id, content) => {
                this.stepsManager.updateStep(id, content)
            },
            onStream: step => {
                this.stepsManager.addStep(step)
            },
            onComplete: (id, error) => {
                this.stepsManager.completeStep(id, error)
            },
            onConfirmationNeeded: async (id, step) => {
                return this.stepsManager.addConfirmationStep(id, step)
            },
        }
    }

    /**
     * Register the tools with the multiplexer.
     */
    protected initializeMultiplexer(tools: CodyTool[]): void {
        for (const tool of tools) {
            const { tags } = tool.config
            this.multiplexer.sub(tags.tag.toString(), {
                onResponse: async (content: string) => {
                    tool.stream(content)
                },
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
        const startTime = performance.now()
        await this.reviewLoop(requestID, span, chatAbortSignal, maxLoops)
        telemetryRecorder.recordEvent('cody.deep-cody.context', 'reviewed', {
            privateMetadata: {
                requestID,
                model: DeepCodyAgent.model,
                traceId: span.spanContext().traceId,
                chatAgent: DeepCodyAgent.id,
            },
            metadata: {
                loop: this.stats.loop, // Number of loops run.
                fetched: this.stats.context, // Number of context fetched.
                context: this.context.length, // Number of context used.
                durationMs: performance.now() - startTime,
            },
            billingMetadata: {
                product: 'cody',
                category: 'billable',
            },
        })
        return this.context
    }

    private async reviewLoop(
        requestID: string,
        span: Span,
        chatAbortSignal: AbortSignal,
        maxLoops: number
    ): Promise<void> {
        span.addEvent('reviewLoop')
        for (let i = 0; i < maxLoops && !chatAbortSignal.aborted; i++) {
            this.stats.loop++
            const step = this.stepsManager.addStep({ title: 'Reflecting' })
            const newContext = await this.review(requestID, span, chatAbortSignal)
            this.statusCallback.onComplete(step.id)
            if (!newContext.length) break
            // Filter and add new context items in one pass
            const validItems = newContext.filter(c => c.title !== 'TOOLCONTEXT')
            this.context.push(...validItems)
            this.stats.context += validItems.length
            if (newContext.every(isUserAddedItem)) break
        }
        this.statusCallback.onComplete()
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
        const { prompt } = await prompter.makePrompt(this.chatBuilder, 1, this.promptMixins)
        span.addEvent('sendReviewRequest')
        try {
            const res = await this.processStream(requestID, prompt, chatAbortSignal, DeepCodyAgent.model)
            // If the response is empty or only contains the answer token, it's ready to answer.
            if (!res || isReadyToAnswer(res)) {
                return []
            }

            const step = this.stepsManager.addStep({ title: 'Retrieving context' })

            const results = await Promise.all(
                this.tools.map(async tool => {
                    try {
                        if (chatAbortSignal.aborted) return []
                        return await tool.run(span, this.statusCallback)
                    } catch (error) {
                        const errorMessage =
                            error instanceof Error
                                ? error.message
                                : typeof error === 'object' && error !== null
                                  ? JSON.stringify(error)
                                  : String(error)
                        const errorObject = error instanceof Error ? error : new Error(errorMessage)
                        this.statusCallback.onComplete(tool.config.tags.tag.toString(), errorObject)
                        return []
                    }
                })
            )

            const newContext = results.flat().filter(isDefined)
            if (newContext.length > 0) {
                this.stats.context = this.stats.context + newContext.length
                this.statusCallback.onUpdate(step.id, `fetched ${toPlural(newContext.length, 'item')}`)
            }

            const reviewed = []
            const currentContext = [
                ...this.context,
                ...this.chatBuilder
                    .getDehydratedMessages()
                    .flatMap(m => (m.contextFiles ? [...m.contextFiles].reverse() : []))
                    .filter(isDefined),
            ]
            // Extract context items that are enclosed with context tags from the response.
            // We will validate the context items by checking if the context item is in the current context,
            // which is a list of context that we have fetched in this round, and the ones from user's current
            // chat session.
            const contextNames = RawTextProcessor.extract(res, contextTag)
            for (const contextName of contextNames) {
                for (const item of currentContext) {
                    if (item.uri.path.endsWith(contextName)) {
                        // Try getting the full content for the requested file.
                        const file = (await getContextFromRelativePath(contextName)) || item
                        reviewed.push({ ...file, source: ContextItemSource.Agentic })
                    }
                }
            }
            // When there are context items matched, we will replace the current context with
            // the reviewed context list, but first we will make sure all the user added context
            // items are not removed from the updated context list. We will let the prompt builder
            // at the final stage to do the unique context check.
            if (reviewed.length > 0) {
                this.statusCallback.onStream({
                    title: 'Optimizing context',
                    content: `selected ${toPlural(reviewed.length, 'item')}`,
                })
                const userAdded = this.context.filter(c => isUserAddedItem(c))
                reviewed.push(...userAdded)
                this.context = reviewed
            }

            return newContext
        } catch (error) {
            await this.multiplexer.notifyTurnComplete()
            logDebug('Deep Cody', `context review failed: ${error}`, { verbose: { prompt, error } })
            return []
        }
    }

    protected async processStream(
        requestID: string,
        message: Message[],
        parentSignal: AbortSignal,
        model?: string
    ): Promise<string> {
        const abortController = forkSignal(parentSignal || new AbortController().signal)
        const stream = await this.chatClient.chat(
            message,
            { model, maxTokensToSample: 4000 },
            abortController.signal,
            requestID
        )
        const accumulated = new RawTextProcessor()
        try {
            for await (const msg of stream) {
                if (parentSignal?.aborted) break
                if (msg.type === 'change') {
                    const newText = msg.text.slice(accumulated.length)
                    accumulated.append(newText)
                    await this.multiplexer.publish(newText)
                }
                if (msg.type === 'complete') {
                    break
                }
                if (msg.type === 'error') {
                    throw msg.error
                }
            }
        } finally {
            await this.multiplexer.notifyTurnComplete()
        }

        return accumulated.consumeAndClear()
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

    // Destructive read that clears state
    public consumeAndClear(): string {
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

const answerTag = ACTIONS_TAGS.ANSWER.toString()
const contextTag = ACTIONS_TAGS.CONTEXT.toString()
const isReadyToAnswer = (text: string) => text === `<${answerTag}>`
const toPlural = (num: number, text: string) => `${num} ${text}${num > 1 ? 's' : ''}`
