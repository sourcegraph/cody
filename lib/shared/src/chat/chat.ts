import { authStatus } from '../auth/authStatus'
import { firstValueFrom } from '../misc/observable'
import { modelsService } from '../models/modelsService'
import type { Message } from '../sourcegraph-api'
import type { SourcegraphCompletionsClient } from '../sourcegraph-api/completions/client'
import type {
    CompletionGeneratorValue,
    CompletionParameters,
} from '../sourcegraph-api/completions/types'
import { currentSiteVersion } from '../sourcegraph-api/siteVersion'

type ChatParameters = Omit<CompletionParameters, 'messages'>

const DEFAULT_CHAT_COMPLETION_PARAMETERS: Omit<ChatParameters, 'maxTokensToSample'> = {
    temperature: 0.2,
    topK: -1,
    topP: -1,
}

export class ChatClient {
    constructor(private completions: SourcegraphCompletionsClient) {}

    public async chat(
        messages: Message[],
        params: Partial<ChatParameters> & Pick<ChatParameters, 'maxTokensToSample'>,
        abortSignal?: AbortSignal
    ): Promise<AsyncGenerator<CompletionGeneratorValue>> {
        // Replace internal models used for wrapper models with the actual model ID.
        if (params.model?.includes('deep-cody')) {
            const sonnetModel = modelsService.getAllModelsWithSubstring('sonnet')[0]
            params.model = sonnetModel.id
        }

        const [versions, authStatus_] = await Promise.all([
            currentSiteVersion(),
            await firstValueFrom(authStatus),
        ])
        if (!versions) {
            throw new Error('unable to determine Cody API version')
        }
        if (!authStatus_.authenticated) {
            throw new Error('not authenticated')
        }

        const useApiV1 = versions.codyAPIVersion >= 1 && params.model?.includes('claude-3')
        const isLastMessageFromHuman = messages.length > 0 && messages.at(-1)!.speaker === 'human'

        const isFireworks = params?.model?.startsWith('fireworks/')
        const augmentedMessages =
            params?.model?.startsWith('fireworks/') || useApiV1
                ? sanitizeMessages(messages)
                : isLastMessageFromHuman
                  ? messages.concat([{ speaker: 'assistant' }])
                  : messages

        // We only want to send up the speaker and prompt text, regardless of whatever other fields
        // might be on the messages objects (`file`, `displayText`, `contextFiles`, etc.).
        const messagesToSend = augmentedMessages.map(({ speaker, text }) => ({
            text,
            speaker,
        }))

        const completionParams = {
            ...DEFAULT_CHAT_COMPLETION_PARAMETERS,
            ...params,
            messages: messagesToSend,
        }

        // Enabled Fireworks tracing for Sourcegraph teammates.
        // https://readme.fireworks.ai/docs/enabling-tracing

        const customHeaders: Record<string, string> =
            isFireworks && authStatus_.isFireworksTracingEnabled ? { 'X-Fireworks-Genie': 'true' } : {}

        return this.completions.stream(
            completionParams,
            {
                apiVersion: useApiV1 ? versions.codyAPIVersion : 0,
                customHeaders,
            },
            abortSignal
        )
    }
}

export function sanitizeMessages(messages: Message[]): Message[] {
    let sanitizedMessages = messages

    // 1. If the last message is from an `assistant` with no or empty `text`, omit it
    let lastMessage = messages.at(-1)
    const truncateLastMessage =
        lastMessage && lastMessage.speaker === 'assistant' && !messages.at(-1)!.text?.length
    sanitizedMessages = truncateLastMessage ? messages.slice(0, -1) : messages

    // 2. If there is any assistant message in the middle of the messages without a `text`, omit
    //    both the empty assistant message as well as the unanswered question from the `user`
    sanitizedMessages = sanitizedMessages.filter((message, index) => {
        // If the message is the last message, it is not a middle message
        if (index >= sanitizedMessages.length - 1) {
            return true
        }

        // If the next message is an assistant message with no or empty `text`, omit the current and
        // the next one
        const nextMessage = sanitizedMessages[index + 1]
        if (
            (nextMessage.speaker === 'assistant' && !nextMessage.text?.length) ||
            (message.speaker === 'assistant' && !message.text?.length)
        ) {
            return false
        }
        return true
    })

    // 3. Final assistant content cannot end with trailing whitespace
    lastMessage = sanitizedMessages.at(-1)
    if (lastMessage?.speaker === 'assistant' && lastMessage.text?.length) {
        const lastMessageText = lastMessage.text.trimEnd()
        lastMessage.text = lastMessageText
    }

    return sanitizedMessages
}
