import {
    BotResponseMultiplexer,
    type ChatClient,
    type CompletionParameters,
    type ContextItem,
    PromptString,
    firstResultFromOperation,
    logDebug,
    modelsService,
    newPromptMixin,
    ps,
} from '@sourcegraph/cody-shared'
import { getOSPromptString } from '../../os'
import { getCategorizedMentions } from '../../prompt-builder/utils'
import { ChatBuilder } from '../chat-view/ChatBuilder'
import { DefaultPrompter } from '../chat-view/prompt'
import type { CodyTool } from './CodyTool'
import { multiplexerStream } from './utils'

/**
 * A DeepCodyAgent is created for each chat submitted by the user.
 * It is responsible for reviewing the retrieved context, and perform agentic context retrieval for the chat request.
 */
export class DeepCodyAgent {
    public static readonly ModelRef = 'sourcegraph::2023-06-01::deep-cody'

    private readonly multiplexer = new BotResponseMultiplexer()

    constructor(
        private readonly chatBuilder: ChatBuilder,
        private readonly chatClient: ChatClient,
        private readonly tools: CodyTool[],
        private currentContext: ContextItem[]
    ) {
        this.initializeMultiplexer()
    }

    private initializeMultiplexer(): void {
        for (const tool of this.tools) {
            this.multiplexer.sub(tool.tag.toString(), {
                onResponse: async (c: string) => {
                    tool.process(c)
                },
                onTurnComplete: async () => Promise.resolve(),
            })
        }
    }

    /**
     * Retrieves the context for the specified model, with additional agentic context retrieval
     * if the last requested context contains codebase search results.
     *
     * @param model - The model to retrieve the context for.
     * @param abortSignal - An AbortSignal to cancel the operation.
     * @returns The context items for the specified model.
     */
    public async getContext(model: string, abortSignal: AbortSignal): Promise<ContextItem[]> {
        // Only users with the DeepCody flag can access this model.
        if (!model.includes('deep-cody')) {
            return []
        }
        // Review current chat and context to get the agentic context.
        const agenticContext = await this.review(abortSignal)
        // Run review again if the last requested context contains codebase search results.
        if (agenticContext?.some(c => c.type === 'file')) {
            this.currentContext.push(...agenticContext)
            const additionalContext = await this.review(abortSignal)
            agenticContext.push(...additionalContext)
        }
        logDebug('DeepCody', 'agenticContext', { verbose: { agenticContext } })
        return agenticContext
    }

    private async review(abortSignal: AbortSignal): Promise<ContextItem[]> {
        const { explicitMentions, implicitMentions } = getCategorizedMentions(this.currentContext)

        const prompter = new DefaultPrompter(explicitMentions, implicitMentions.slice(-20))
        const promptText = this.buildPrompt()
        const { prompt } = await prompter.makePrompt(this.chatBuilder, 1, [newPromptMixin(promptText)])

        const model = this.chatBuilder.selectedModel
        const contextWindow = await firstResultFromOperation(
            ChatBuilder.contextWindowForChat(this.chatBuilder)
        )
        const params = { model, maxTokensToSample: contextWindow.output } as CompletionParameters
        if (model && modelsService.isStreamDisabled(model)) {
            params.stream = false
        }

        try {
            const stream = this.chatClient.chat(prompt, params, abortSignal)
            await multiplexerStream(stream, this.multiplexer, abortSignal)

            const context = await Promise.all(this.tools.map(t => t.execute()))
            return context.flat()
        } catch (error: unknown) {
            logDebug('DeepCody', `failed: ${error}`, { verbose: { prompt, error } })
            return []
        }
    }

    private buildPrompt(): PromptString {
        const tools = PromptString.join(
            this.tools.map(t => t.getInstruction()),
            ps`\n- `
        )
        const examples = PromptString.join(
            this.tools.map(t => t.prompt.example),
            ps`\n`
        )

        return PROMPT.replace('{{CODY_TOOL_LIST}}', tools).replace('{{CODY_TOOL_EXAMPLE}}', examples)
    }
}

const PROMPT = ps`Analyze the provided context and think step-by-step about whether you can answer the Question below using the available information.

If you need more information to answer the question, use the following action tags:

{{CODY_TOOL_LIST}}

Examples:
{{CODY_TOOL_EXAMPLE}}

Notes:
- Only use the above action tags when you need additional information.
- You can request multiple pieces of information in a single response.
- When replying to a question with a shell command, enclose the command in a Markdown code block.
- My dev environment is on ${getOSPromptString()}.
- If you don't require additional context to answer the question, reply with a single word: "Reviewed".`
