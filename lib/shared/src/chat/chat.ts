import { dotcomTokenToGatewayToken } from '../auth/tokens'
import type { AuthStatus } from '../auth/types'
import type { ConfigurationWithAccessToken } from '../configuration'
import { supportsUnifiedApi } from '../models/utils'
import { ANSWER_TOKENS } from '../prompt/constants'
import type { Message } from '../sourcegraph-api'
import type { SourcegraphCompletionsClient } from '../sourcegraph-api/completions/client'
import type {
    CompletionGeneratorValue,
    CompletionParameters,
} from '../sourcegraph-api/completions/types'
import { createFastPathClient } from './fast-path-client'

type ChatParameters = Omit<CompletionParameters, 'messages'>

const DEFAULT_CHAT_COMPLETION_PARAMETERS: ChatParameters = {
    temperature: 0.2,
    maxTokensToSample: ANSWER_TOKENS,
    topK: -1,
    topP: -1,
}

export class ChatClient {
    private fastPathAccessToken?: string

    constructor(
        private completions: SourcegraphCompletionsClient,
        config: Pick<ConfigurationWithAccessToken, 'accessToken'>,
        private authStatus: Pick<AuthStatus, 'userCanUpgrade' | 'isDotCom' | 'endpoint'>
    ) {
        const isNode = typeof process !== 'undefined'

        this.fastPathAccessToken =
            config.accessToken &&
            // Require the upstream to be dotcom
            authStatus.isDotCom &&
            // The fast path client only supports Node.js style response streams
            isNode
                ? dotcomTokenToGatewayToken(config.accessToken)
                : undefined
    }

    // TODO: add onConfigurationChange and handle auth status changes

    public chat(
        messages: Message[],
        params: Partial<ChatParameters>,
        abortSignal?: AbortSignal
    ): AsyncGenerator<CompletionGeneratorValue> {
        const useFastPath =
            this.fastPathAccessToken !== undefined && params.model && supportsUnifiedApi(params.model)

        const isLastMessageFromHuman = messages.length > 0 && messages.at(-1)!.speaker === 'human'

        const augmentedMessages =
            params?.model?.startsWith('fireworks/') || useFastPath
                ? sanitizeMessages(messages)
                : isLastMessageFromHuman
                  ? messages.concat([{ speaker: 'assistant' }])
                  : messages

        // Strip `file` from any messages that are ContextMessage type, so that we don't send it up.
        // We only want to send up what's in the prompt text.
        const messagesWithoutFile = augmentedMessages.map(message => ({ ...message, file: undefined }))

        const completionParams = {
            ...DEFAULT_CHAT_COMPLETION_PARAMETERS,
            ...params,
            messages: messagesWithoutFile,
        }

        if (useFastPath) {
            return createFastPathClient(
                completionParams,
                this.authStatus,
                this.fastPathAccessToken!,
                abortSignal,
                undefined /* TODO: add logger */
            )
        }

        return this.completions.stream(completionParams, abortSignal)
    }
}

export function sanitizeMessages(messages: Message[]): Message[] {
    let sanitizedMessages = messages

    // 1. If the last message is from an `assistant` with no or empty `text`, omit it
    let lastMessage = messages.at(-1)
    const truncateLastMessage =
        lastMessage && lastMessage.speaker === 'assistant' && !messages.at(-1)!.text
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
            (nextMessage.speaker === 'assistant' && !nextMessage.text) ||
            (message.speaker === 'assistant' && !message.text)
        ) {
            return false
        }
        return true
    })

    // 3. Final assistant content cannot end with trailing whitespace
    lastMessage = sanitizedMessages.at(-1)
    if (lastMessage?.speaker === 'assistant' && lastMessage.text) {
        const lastMessageText = lastMessage.text.trimEnd()
        lastMessage.text = lastMessageText
    }

    return sanitizedMessages
}
