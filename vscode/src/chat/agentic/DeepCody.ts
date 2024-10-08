import {
    BotResponseMultiplexer,
    type ChatClient,
    type ContextItem,
    type PromptMixin,
    PromptString,
    logDebug,
    newPromptMixin,
    ps,
} from '@sourcegraph/cody-shared'
import { getOSPromptString } from '../../os'
import { getCategorizedMentions } from '../../prompt-builder/utils'
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

    private readonly promptMixins: PromptMixin[] = []
    private readonly multiplexer = new BotResponseMultiplexer()
    private context: AgenticContext = { explicit: [], implicit: [] }

    constructor(
        private readonly chatBuilder: ChatBuilder,
        private readonly chatClient: Pick<ChatClient, 'chat'>,
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
        // TODO (bee) investigate on the right numbers for these params.
        // Currently limiting to these numbers to avoid long processing time during reviewing step.
        loop = 2,
        // Keep the last n amount of the search items to override old items with new ones.
        maxSearchItems = 30
    ): Promise<ContextItem[]> {
        const start = performance.now()
        const count = { context: 0, loop: 0 }

        for (let i = 0; i < loop && !chatAbortSignal.aborted; i++) {
            const newContext = await this.review(chatAbortSignal)
            this.sort(newContext)
            count.context += newContext.length
            count.loop++
            if (!newContext.length || count.context) {
                break
            }
        }

        const duration = performance.now() - start
        logDebug('DeepCody', 'Aagentic context retrieval completed', { verbose: { count, duration } })
        return [...this.context.implicit.slice(-maxSearchItems), ...this.context.explicit]
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
            const stream = await this.chatClient.chat(
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

        return ps`Your task is to review the shared context and think step-by-step to determine if you can answer the "Question:" at the end.
        [INSTRUCTIONS]
        1. Analyze the shared context thoroughly.
        2. Decide if you have enough information to answer the question.
        3. Respond with ONLY ONE of the following:
            a) The word "CONTEXT_SUFFICIENT" if you can answer the question with the current context.
            b) One or more <TOOL*> tags to request additional information if needed.

        [TOOLS]
        ${join(this.tools.map(t => t.getInstruction()))}

        [TOOL USAGE EXAMPLES]
        ${join(this.tools.map(t => t.prompt.example))}
        - To see the full content of a codebase file and context of how the Controller class is use: \`<TOOLFILE><name>path/to/file.ts</name></TOOLFILE><TOOLSEARCH><query>class Controller</query></TOOLSEARCH>\`

        [RESPONSE FORMAT]
        - If you can answer the question fully, respond with ONLY the word "CONTEXT_SUFFICIENT".
        - If you need more information, use ONLY the appropriate <TOOL*> tag(s) in your response.

        [NOTES]
        1. Only use <TOOL*> tags when additional context is necessary to answer the question.
        2. You may use multiple <TOOL*> tags in a single response if needed.
        3. Never request sensitive information such as passwords or API keys.
        4. The user is working with ${getOSPromptString()}.

        [GOAL] Determine if you can answer the question with the given context or if you need more information. Do not provide the actual answer in this step.`
    }
}
