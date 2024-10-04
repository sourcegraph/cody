import {
    BotResponseMultiplexer,
    type ChatClient,
    type CompletionParameters,
    type ContextItem,
    FeatureFlag,
    type Model,
    PromptString,
    firstResultFromOperation,
    logDebug,
    modelsService,
    newPromptMixin,
    ps,
} from '@sourcegraph/cody-shared'
import { getOSPromptString } from '../../os'
import { getCategorizedMentions } from '../../prompt-builder/utils'
import { logFirstEnrollmentEvent } from '../../services/utils/enrollment-event'
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
    /**
     * Return modelRef for first time enrollment of Deep Cody.
     */
    public static isEnrolled(models: Model[]): string | undefined {
        // Only enrolled user has access to the Deep Cody model.
        const hasAccess = models.some(m => m.id === DeepCodyAgent.ModelRef)
        const enrolled = logFirstEnrollmentEvent(FeatureFlag.DeepCody, true)
        if (hasAccess && !enrolled) {
            logDebug('DeepCody', 'First time enrollment detected.')
            return 'sourcegraph::2023-06-01::deep-cody'
        }
        // Does not have access or not enrolled.
        return undefined
    }

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
     * @param userAbortSignal - An AbortSignal to cancel the operation.
     * @returns The context items for the specified model.
     */
    public async getContext(chatAbortSignal: AbortSignal): Promise<ContextItem[]> {
        // Review current chat and context to get the agentic context.
        const agenticContext = await this.review(chatAbortSignal)
        // Run review again if the last requested context contains codebase search results.
        if (agenticContext?.some(c => c.type === 'file')) {
            this.currentContext.push(...agenticContext)
            const additionalContext = await this.review(chatAbortSignal)
            agenticContext.push(...additionalContext)
        }
        logDebug('DeepCody', 'getContext', { verbose: { agenticContext } })
        return agenticContext
    }

    private async review(chatAbortSignal: AbortSignal): Promise<ContextItem[]> {
        if (chatAbortSignal.aborted) {
            return []
        }
        // Create a seperate AbortController to ensure this process will not affect the original chat request.
        const agentAbortController = new AbortController()

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

        logDebug('DeepCody', 'reviewing...')

        try {
            const stream = this.chatClient.chat(prompt, params, agentAbortController.signal)
            await multiplexerStream(stream, this.multiplexer, agentAbortController.signal)

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
            ps`\n- `
        )

        return PROMPT.replace('{{CODY_TOOL_LIST}}', tools).replace('{{CODY_TOOL_EXAMPLE}}', examples)
    }
}

const PROMPT = ps`Your task is to review all shared context, then think step-by-step about whether you can provide me with a helpful answer for the "Question:" based on the shared context. If more information from my codebase is needed for the answer, you can request the following context using these action tags:
- {{CODY_TOOL_LIST}}

Examples:
- {{CODY_TOOL_EXAMPLE}}

Notes:
- If you can answer my question without extra codebase context, reply me with a single word: "Review".
- Only reply with <TOOL*> tags if additional context is required for someone to provide a helpful answer.
- Do not request sensitive information such as password or API keys from any source.
- You can include multiple action tags in a single response.
- I am working with ${getOSPromptString()}.`
