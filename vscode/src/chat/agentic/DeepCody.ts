import type { Span } from '@opentelemetry/api'
import {
    CodyIDE,
    type ContextItem,
    PromptString,
    clientCapabilities,
    getClientPromptString,
    isDefined,
    logDebug,
    ps,
    telemetryRecorder,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { isUserAddedItem } from '../../prompt-builder/utils'
import { CodyChatAgent } from './CodyChatAgent'
import { CODYAGENT_PROMPTS } from './prompts'

/**
 * A DeepCodyAgent is created for each chat submitted by the user.
 *
 * It is responsible for reviewing the retrieved context, and perform agentic context retrieval for the chat request.
 */
export class DeepCodyAgent extends CodyChatAgent {
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
            .replace(
                '{{CODY_IDE}}',
                getClientPromptString(clientCapabilities().agentIDE || CodyIDE.VSCode)
            )
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
        requestID: string,
        chatAbortSignal: AbortSignal,
        maxLoops = 2
    ): Promise<ContextItem[]> {
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
        const count = await this.reviewLoop(requestID, span, chatAbortSignal, maxLoops)

        telemetryRecorder.recordEvent('cody.deep-cody.context', 'reviewed', {
            privateMetadata: {
                durationMs: performance.now() - startTime,
                ...count,
                model: this.models.review,
                traceId: span.spanContext().traceId,
            },
            billingMetadata: {
                product: 'cody',
                category: 'billable',
            },
        })

        this.statusCallback?.onComplete()

        return this.context
    }

    private async reviewLoop(
        requestID: string,
        span: Span,
        chatAbortSignal: AbortSignal,
        maxLoops: number
    ): Promise<{ context: number; loop: number }> {
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
        return stats
    }

    /**
     * Performs a review of the current context and generates new context items based on the review outcome.
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
                this.models.review
            )
            // If the response is empty or contains the CONTEXT_SUFFICIENT token, the context is sufficient.
            if (!res || res?.includes('CONTEXT_SUFFICIENT')) {
                // Process the response without generating any context items.
                for (const tool of this.toolHandlers.values()) {
                    tool.processResponse?.()
                }
                return []
            }
            const results = await Promise.all(
                Array.from(this.toolHandlers.entries()).map(async ([name, tool]) => {
                    try {
                        // Check abort signal before each tool run
                        if (chatAbortSignal.aborted) {
                            return []
                        }
                        return await tool.run(span, this.statusCallback)
                    } catch (error) {
                        this.statusCallback?.onComplete(name, error as Error)
                        return []
                    }
                })
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
