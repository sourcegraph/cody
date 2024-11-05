import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    PromptString,
    isDefined,
    logDebug,
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

    protected buildPrompt(): PromptString {
        const toolInstructions = this.tools.map(t => t.getInstruction())
        const toolExamples = this.tools.map(t => t.config.prompt.example)
        const join = (prompts: PromptString[]) => PromptString.join(prompts, ps`\n- `)

        return CODYAGENT_PROMPTS.review
            .replace('{{CODY_TOOLS_PLACEHOLDER}}', join(toolInstructions))
            .replace('{{CODY_TOOLS_EXAMPLES_PLACEHOLDER}}', join(toolExamples))
    }

    public async getContext(
        span: Span,
        chatAbortSignal: AbortSignal,
        maxLoops = 2
    ): Promise<ContextItem[]> {
        const startTime = performance.now()
        const count = await this.reviewLoop(span, chatAbortSignal, maxLoops)

        telemetryRecorder.recordEvent('cody.deep-cody.context', 'executed', {
            privateMetadata: {
                durationMs: performance.now() - startTime,
                ...count,
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

    private async review(span: Span, chatAbortSignal: AbortSignal): Promise<ContextItem[]> {
        const fastChatModel = 'anthropic::2023-06-01::claude-3-5-haiku-latest'
        const model = this.chatBuilder.selectedModel || fastChatModel
        const prompter = this.getPrompter(this.context)
        const promptData = await prompter.makePrompt(
            this.chatBuilder,
            1,
            this.promptMixins,
            DeepCodyAgent.ID
        )

        try {
            const res = await this.processStream(promptData.prompt, chatAbortSignal, model)
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
