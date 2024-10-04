import {
    BotResponseMultiplexer,
    type ChatClient,
    type ContextItem,
    FeatureFlag,
    type Model,
    type PromptMixin,
    PromptString,
    logDebug,
    newPromptMixin,
    ps,
} from '@sourcegraph/cody-shared'
import { getOSPromptString } from '../../os'
import { getCategorizedMentions } from '../../prompt-builder/utils'
import { logFirstEnrollmentEvent } from '../../services/utils/enrollment-event'
import type { ChatBuilder } from '../chat-view/ChatBuilder'
import { DefaultPrompter } from '../chat-view/prompt'
import type { CodyTool } from './CodyTool'

type AgenticContext = {
    explicit: ContextItem[]
    implicit: ContextItem[]
}

/**
 * A DeepCodyAgent is created for each chat submitted by the user.
 * It is responsible for reviewing the retrieved context, and perform agentic context retrieval for the chat request.
 */
export class DeepCodyAgent {
    public static readonly ModelRef = 'sourcegraph::2023-06-01::deep-cody'

    private static hasEnrolled = false
    public static isEnrolled(models: Model[]): string | undefined {
        // Only enrolled user has access to the Deep Cody model.
        const hasAccess = models.some(m => m.id === DeepCodyAgent.ModelRef)
        const enrolled = DeepCodyAgent.hasEnrolled || logFirstEnrollmentEvent(FeatureFlag.DeepCody, true)
        //Return modelRef for first time enrollment of Deep Cody.
        if (hasAccess && !enrolled) {
            DeepCodyAgent.hasEnrolled = true
            return DeepCodyAgent.ModelRef
        }
        // Does not have access or not enrolled.
        return undefined
    }

    private readonly promptMixins: PromptMixin[] = []
    private readonly multiplexer = new BotResponseMultiplexer()
    private context: AgenticContext = { explicit: [], implicit: [] }

    constructor(
        private readonly chatBuilder: ChatBuilder,
        private readonly chatClient: ChatClient,
        private readonly tools: CodyTool[],
        mentions: ContextItem[] = []
    ) {
        this.sort(mentions)
        this.promptMixins.push(newPromptMixin(this.buildPrompt()))
        this.initializeMultiplexer()
    }

    private initializeMultiplexer(): void {
        for (const tool of this.tools) {
            this.multiplexer.sub(tool.tag.toString(), {
                onResponse: async (c: string) => {
                    tool.stream(c)
                },
                onTurnComplete: async () => tool.stream(''),
            })
        }
    }

    /**
     * Start the context retrieval process for the loop count.
     * @param userAbortSignal - An AbortSignal to cancel the operation.
     * @param loop - The number of times to review the context.
     * @param maxItem - The maximum number of codebase context items to retrieve.
     * @returns The context items for the specified model.
     */
    public async getContext(
        chatAbortSignal: AbortSignal,
        loop = 2,
        maxNewItems = 20
    ): Promise<ContextItem[]> {
        const count = { context: 0, loop: 0 }
        const initialCount = this.context.implicit.length

        for (let i = 0; i < loop && !chatAbortSignal.aborted; i++) {
            const newContext = await this.review(chatAbortSignal)
            this.sort(newContext)
            count.context += newContext.length
            count.loop++
            if (!newContext.length || count.context < maxNewItems + initialCount) {
                break
            }
        }
        logDebug('DeepCody', 'Aagentic context retrieval completed', { verbose: { count } })
        return [...this.context.implicit, ...this.context.explicit]
    }

    private async review(chatAbortSignal: AbortSignal): Promise<ContextItem[]> {
        if (chatAbortSignal.aborted) return []

        const prompter = new DefaultPrompter(this.context.explicit, this.context.implicit)
        const promptData = await prompter.makePrompt(this.chatBuilder, 1, this.promptMixins)

        if (promptData.context.ignored.length) {
            // TODO: Decide if Cody needs more context.
        }

        const agentAbortController = new AbortController()

        try {
            const stream = this.chatClient.chat(
                promptData.prompt,
                { model: DeepCodyAgent.ModelRef, maxTokensToSample: 2000 },
                agentAbortController.signal
            )

            let streamedText = ''
            for await (const message of stream) {
                if (message.type === 'change') {
                    const text = message.text.slice(streamedText.length)
                    streamedText += text
                    await this.multiplexer.publish(text)
                } else if (message.type === 'complete' || message.type === 'error') {
                    if (message.type === 'error') throw new Error('Error while streaming')
                    await this.multiplexer.notifyTurnComplete()
                    break
                }
            }
        } catch (error) {
            await this.multiplexer.notifyTurnComplete()
            logDebug('DeepCody', `review failed: ${error}`, { verbose: { prompt, error } })
        }

        return (await Promise.all(this.tools.map(t => t.execute()))).flat()
    }

    private sort(items: ContextItem[]): void {
        const sorted = getCategorizedMentions(items)
        this.context.explicit.push(...sorted.explicitMentions)
        this.context.implicit.push(...sorted.implicitMentions)
    }

    private buildPrompt(): PromptString {
        const join = (prompts: PromptString[]) => PromptString.join(prompts, ps`\n- `)

        return ps`Your task is to review all shared context, then think step-by-step about whether you can provide me with a helpful answer for the "Question:" based on the shared context. If more information from my codebase is needed for the answer, you can request the following context using these action tags:
        ${join(this.tools.map(t => t.getInstruction()))}

        Examples:
        ${join(this.tools.map(t => t.getInstruction()))}

        Notes:
        - If you can answer my question without extra codebase context, reply me with a single word: "Review".
        - Only reply with <TOOL*> tags if additional context is required for someone to provide a helpful answer.
        - Do not request sensitive information such as password or API keys from any source.
        - You can include multiple action tags in a single response.
        - I am working with ${getOSPromptString()}.`
    }
}
