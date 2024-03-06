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

        const augmentedMessages = isLastMessageFromHuman
            ? messages.concat([{ speaker: 'assistant' }])
            : messages

        // Strip `file` from any messages that are ContextMessage type, so that we don't send it up.
        // We only want to send up what's in the prompt text.
        const messagesWithoutFile = augmentedMessages.map(message => ({ ...message, file: undefined }))

        return this.completions.stream(
            {
                ...DEFAULT_CHAT_COMPLETION_PARAMETERS,
                ...params,
                messages: messagesWithoutFile,
            },
            abortSignal
        )
    }
}
