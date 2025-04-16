import {
    type ChatClient,
    type ChatModel,
    type CompletionParameters,
    type Message,
    PromptString,
    firstResultFromOperation,
    modelsService,
    ps,
} from '@sourcegraph/cody-shared'

export type RegenerateRequestParams = {
    requestID: string
    model: ChatModel
    code: PromptString
    language: PromptString | undefined
    abort: AbortSignal
}

type JustChat = Pick<ChatClient, 'chat'>

/**
 * Given some code, can prompt the LLM to rewrite it. Guardrails uses this
 * to regenerate code blocks that failed Guardrails checks.
 */
export class CodeBlockRegenerator {
    constructor(private readonly client: JustChat) {}

    async regenerate(params: RegenerateRequestParams): Promise<PromptString> {
        const fence = ps`\`\`\``
        const prompt: Message[] = [
            {
                speaker: 'system',
                text: ps`You are an LLM integrated into an AI coding assistant tool.`,
            },
            {
                speaker: 'human',
                text: ps`You generated the following code for us, but it matches code we found in a database of existing code, so unfortunately we can't use this code as-is. Please generate a new and non-infringing implementation of this code:\n\n${fence}${
                    params.language ?? ''
                }\n${
                    params.code
                }\n${fence}\n\nProvide the updated code without preamble commentary. Use a Markdown ${fence} as shown above. If you can't do it, please explain the problem in one line of plain text prose.`,
            },
        ]
        return this.sendLLMRequest(params.requestID, prompt, params.model, params.abort)
    }

    private async sendLLMRequest(
        requestID: string,
        prompt: Message[],
        model: ChatModel,
        abort: AbortSignal
    ): Promise<PromptString> {
        try {
            const params = {
                maxTokensToSample: (
                    await firstResultFromOperation(modelsService.observeContextWindowByID(model))
                ).output,
                messages: prompt,
                model,
                stream: false,
            } satisfies CompletionParameters

            abort.throwIfAborted()

            let content = ''
            const stream = await this.client.chat(prompt, params, abort, requestID)
            outer: for await (const message of stream) {
                switch (message.type) {
                    case 'change': {
                        content = message.text
                        break
                    }
                    case 'complete': {
                        break outer
                    }
                    case 'error': {
                        throw message.error
                    }
                }
            }
            return PromptString.unsafe_fromLLMResponse(content)
        } catch (anything: unknown) {
            throw anything instanceof Error ? anything : new Error(`${anything}`)
        }
    }
}
