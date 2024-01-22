import { ANSWER_TOKENS } from '../prompt/constants'
import type { Message } from '../sourcegraph-api'
import type { SourcegraphCompletionsClient } from '../sourcegraph-api/completions/client'
import type {
    CompletionGeneratorValue,
    CompletionParameters,
} from '../sourcegraph-api/completions/types'

type ChatParameters = Omit<CompletionParameters, 'messages'>

const DEFAULT_CHAT_COMPLETION_PARAMETERS: ChatParameters = {
    temperature: 0.2,
    maxTokensToSample: ANSWER_TOKENS,
    topK: -1,
    topP: -1,
}

export class ChatClient {
    constructor(private completions: SourcegraphCompletionsClient) {}

    public chat(
        messages: Message[],
        params: Partial<ChatParameters>,
        abortSignal?: AbortSignal
    ): AsyncGenerator<CompletionGeneratorValue> {
        const isLastMessageFromHuman = messages.length > 0 && messages.at(-1)!.speaker === 'human'

        const augmentedMessages =
            // HACK: The fireworks chat inference endpoints requires the last message to be from a
            // human. This will be the case in most of the prompts but if for some reason we have an
            // assistant at the end, we slice the last message for now.
            params?.model?.startsWith('fireworks/')
                ? isLastMessageFromHuman
                    ? messages
                    : messages.slice(0, -1)
                : isLastMessageFromHuman
                  ? messages.concat([{ speaker: 'assistant' }])
                  : messages

        return this.completions.stream(
            {
                ...DEFAULT_CHAT_COMPLETION_PARAMETERS,
                ...params,
                messages: augmentedMessages,
            },
            abortSignal
        )
    }
}
