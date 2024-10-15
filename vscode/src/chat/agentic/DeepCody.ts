import type { Span } from '@opentelemetry/api'
import {
    BotResponseMultiplexer,
    type ChatClient,
    type ContextItem,
    type PromptMixin,
    PromptString,
    isDefined,
    logDebug,
    newPromptMixin,
    ps,
} from '@sourcegraph/cody-shared'
import { getOSPromptString } from '../../os'
import { getCategorizedMentions } from '../../prompt-builder/utils'
import type { ChatBuilder } from '../chat-view/ChatBuilder'
import { DefaultPrompter } from '../chat-view/prompt'
import type { CodyTool } from './CodyTool'

/**
 * A DeepCodyAgent is created for each chat submitted by the user.
 * It is responsible for reviewing the retrieved context, and perform agentic context retrieval for the chat request.
 */
export class DeepCodyAgent {
    public static readonly ModelRef = 'sourcegraph::2023-06-01::deep-cody'

    private readonly promptMixins: PromptMixin[] = []

    private readonly multiplexer = new BotResponseMultiplexer()

    constructor(
        private readonly chatBuilder: ChatBuilder,
        private readonly chatClient: Pick<ChatClient, 'chat'>,
        private readonly tools: CodyTool[],
        private readonly span: Span,
        private context: ContextItem[] = []
    ) {
        this.promptMixins.push(newPromptMixin(this.buildPrompt()))
        // Register tools to the multiplexer
        for (const tool of this.tools) {
            this.multiplexer.sub(tool.config.tags.tag.toString(), {
                onResponse: async (c: string) => {
                    tool.stream(c)
                },
                onTurnComplete: async () => tool.stream(''),
            })
        }
    }

    /**
     * Retrieves context for the chat by iteratively reviewing and adding new context items.
     * @param chatAbortSignal - AbortSignal for Chat to cancel the operation.
     * TODO (bee) investigate on the right numbers for these params.
     * Currently limiting to these numbers to avoid long processing time during review step.
     * @param loop - The maximum number of review iterations (default: 2).
     * @returns A Promise that resolves to an array of ContextItem objects.
     */
    public async getContext(chatAbortSignal: AbortSignal, loop = 2): Promise<ContextItem[]> {
        const start = performance.now()
        let contextCount = 0
        let loopCount = 0
        for (let i = 0; i < loop && !chatAbortSignal.aborted; i++) {
            if (chatAbortSignal.aborted) break
            const newContext = await this.review(chatAbortSignal)
            if (!newContext.length) break
            this.context.push(...newContext)
            contextCount += newContext.length
            loopCount++
        }
        logDebug('Deep Cody', `${contextCount} agentic context added in ${loopCount} review loops`, {
            verbose: { durationMs: performance.now() - start, contextCount, loopCount },
        })
        return this.context
    }

    private async review(chatAbortSignal: AbortSignal): Promise<ContextItem[]> {
        const prompter = this.getPrompter(this.context)
        const promptData = await prompter.makePrompt(this.chatBuilder, 1, this.promptMixins)

        try {
            const stream = await this.chatClient.chat(
                promptData.prompt,
                { model: DeepCodyAgent.ModelRef, maxTokensToSample: 2000 },
                new AbortController().signal
            )

            let streamed = ''

            for await (const message of stream) {
                if (message.type === 'change') {
                    const text = message.text.slice(streamed.length)
                    streamed += text
                    await this.multiplexer.publish(text)
                } else if (message.type === 'complete' || message.type === 'error') {
                    if (message.type === 'error') throw new Error('Error while streaming')
                    break
                }
                if (chatAbortSignal.aborted) break
            }

            await this.multiplexer.notifyTurnComplete()

            return (await Promise.all(this.tools.map(t => t.execute(this.span))))
                .flat()
                .filter(isDefined)
        } catch (error) {
            await this.multiplexer.notifyTurnComplete()
            logDebug('Deep Cody', `context review failed: ${error}`, {
                verbose: { prompt: promptData.prompt, error },
            })
            return []
        }
    }

    private getPrompter(items: ContextItem[]): DefaultPrompter {
        const { explicitMentions, implicitMentions } = getCategorizedMentions(items)
        const maxSearchItems = 30 // Keep the latest n items and remove the rest.
        return new DefaultPrompter(explicitMentions, implicitMentions.slice(-maxSearchItems))
    }

    private buildPrompt(): PromptString {
        return REVIEW_PROMPT.replace(
            '{{CODY_TOOLS_PLACEHOLDER}}',
            join(this.tools.map(t => t.getInstruction()))
        ).replace(
            '{{CODY_TOOLS_EXAMPLES_PLACEHOLDER}}',
            join(this.tools.map(t => t.config.prompt.example))
        )
    }
}

const join = (prompts: PromptString[]) => PromptString.join(prompts, ps`\n- `)

const REVIEW_PROMPT = ps`Your task is to review the shared context and think step-by-step to determine if you can answer the "Question:" at the end.
[INSTRUCTIONS]
1. Analyze the shared context thoroughly.
2. Decide if you have enough information to answer the question.
3. Respond with ONLY ONE of the following:
    a) The word "CONTEXT_SUFFICIENT" if you can answer the question with the current context.
    b) One or more <TOOL*> tags to request additional information if needed.

[TOOLS]
{{CODY_TOOLS_PLACEHOLDER}}

[TOOL USAGE EXAMPLES]
{{CODY_TOOLS_EXAMPLES_PLACEHOLDER}}
- To see the full content of a codebase file and context of how the Controller class is use: \`<TOOLFILE><name>path/to/file.ts</name></TOOLFILE><TOOLSEARCH><query>class Controller</query></TOOLSEARCH>\`

[RESPONSE FORMAT]
- If you can answer the question fully, respond with ONLY the word "CONTEXT_SUFFICIENT".
- If you need more information, use ONLY the appropriate <TOOL*> tag(s) in your response. Skip preamble.

[NOTES]
1. Only use <TOOL*> tags when additional context is necessary to answer the question.
2. You may use multiple <TOOL*> tags in a single response if needed.
3. Never request sensitive information such as passwords or API keys.
4. The user is working with ${getOSPromptString()}.

[GOAL] Determine if you can answer the question with the given context or if you need more information. Do not provide the actual answer in this step.`
