import { dotcomTokenToGatewayToken } from '../auth/tokens'
import type { AuthStatus } from '../auth/types'
import type { ConfigurationWithAccessToken } from '../configuration'
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
            this.fastPathAccessToken !== undefined && params.model === 'anthropic/claude-2.1-bamboo'
        const isLastMessageFromHuman = messages.length > 0 && messages.at(-1)!.speaker === 'human'

        const augmentedMessages =
            // HACK: The fireworks chat inference endpoints requires the last message to be from a
            // human. This will be the case in most of the prompts but if for some reason we have an
            // assistant at the end, we slice the last message for now.
            params?.model?.startsWith('fireworks/') || useFastPath
                ? isLastMessageFromHuman
                    ? messages
                    : messages.slice(0, -1)
                : isLastMessageFromHuman
                  ? messages.concat([{ speaker: 'assistant' }])
                  : messages

        const completionParams = {
            ...DEFAULT_CHAT_COMPLETION_PARAMETERS,
            ...params,
            messages: augmentedMessages,
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
