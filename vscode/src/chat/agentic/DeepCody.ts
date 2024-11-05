import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    PromptString,
    isDefined,
    logDebug,
    modelsService,
    ps,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import { CodyChatAgent } from './CodyChatAgent'
import { CODYAGENT_PROMPTS } from './prompts'

/**
 * A DeepCodyAgent is created for each chat submitted by the user.
 *
 * It is responsible for reviewing the retrieved context, and perform agentic context retrieval for the chat request.
 */
export class DeepCodyAgent extends CodyChatAgent {
    public static readonly ID = 'deep-cody'

    private models = {
        review: this.chatBuilder.selectedModel,
    }

    protected buildPrompt(): PromptString {
        const toolInstructions = this.tools.map(t => t.getInstruction())
        const toolExamples = this.tools.map(t => t.config.prompt.example)
        const join = (prompts: PromptString[]) => PromptString.join(prompts, ps`\n- `)

        return CODYAGENT_PROMPTS.review
            .replace('{{CODY_TOOLS_PLACEHOLDER}}', join(toolInstructions))
            .replace('{{CODY_TOOLS_EXAMPLES_PLACEHOLDER}}', join(toolExamples))
    }

    /**
     * Retrieves the context for the current chat, by iteratively reviewing the context and adding new items
     * until the maximum number of loops is reached or the chat is aborted.
     *
     * @param span - The OpenTelemetry span for the current chat.
     * @param chatAbortSignal - The abort signal for the current chat.
     * @param maxLoops - The maximum number of loops to perform when retrieving the context.
     * @returns The context items retrieved for the current chat.
     */
    public async getContext(
        span: Span,
        chatAbortSignal: AbortSignal,
        maxLoops = 2
    ): Promise<ContextItem[]> {
        const fastChatModel = modelsService.getModelByID(
            'anthropic::2024-10-22::claude-3-5-haiku-latest'
        )
        this.models.review = fastChatModel?.id ?? this.chatBuilder.selectedModel

        const startTime = performance.now()
        const count = await this.reviewLoop(span, chatAbortSignal, maxLoops)

        telemetryRecorder.recordEvent('cody.deep-cody.context', 'reviewed', {
            privateMetadata: {
                durationMs: performance.now() - startTime,
                ...count,
                model: this.models.review,
            },
            billingMetadata: {
                product: 'cody',
                category: 'billable',
            },
        })

        // Remove the TOOL context item that is only used during the review process.
        return this.context.filter(c => c.title !== 'TOOL')
    }

    private async reviewLoop(
        span: Span,
        chatAbortSignal: AbortSignal,
        maxLoops: number
    ): Promise<{ context: number; loop: number }> {
        let context = 0
        let loop = 0

        for (let i = 0; i < maxLoops && !chatAbortSignal.aborted; i++) {
            const newContext = await this.review(span, chatAbortSignal)
            if (!newContext.length) break

            this.context.push(...newContext)
            context += newContext.length
            loop++
        }

        return { context, loop }
    }

    /**
     * Performs a review of the current context and generates new context items based on the review outcome.
     */
    private async review(span: Span, chatAbortSignal: AbortSignal): Promise<ContextItem[]> {
        const prompter = this.getPrompter(this.context)
        const promptData = await prompter.makePrompt(
            this.chatBuilder,
            1,
            this.promptMixins,
            DeepCodyAgent.ID
        )

        try {
            const res = await this.processStream(promptData.prompt, chatAbortSignal, this.models.review)
            // If the response is empty or contains the CONTEXT_SUFFICIENT token, the context is sufficient.
            if (!res || res?.includes('CONTEXT_SUFFICIENT')) {
                // Process the response without generating any context items.
                for (const tool of this.toolHandlers.values()) {
                    tool.processResponse?.()
                }
                return []
            }
            const results = await Promise.all(
                Array.from(this.toolHandlers.values()).map(tool => tool.execute(span))
            )
            return results.flat().filter(isDefined)
        } catch (error) {
            await this.multiplexer.notifyTurnComplete()
            logDebug('Deep Cody', `context review failed: ${error}`, {
                verbose: { prompt: promptData.prompt, error },
            })
            return []
        }
    }
}
