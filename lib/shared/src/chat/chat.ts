import { isError } from 'lodash'
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

const claudeRegex = /claude-(\d+\.\d+)-/

export class ChatClient {
    constructor(private completions: SourcegraphCompletionsClient) {}

    public async chat(
        messages: Message[],
        params: Partial<ChatParameters> & Pick<ChatParameters, 'maxTokensToSample'>,
        abortSignal?: AbortSignal,
        interactionId?: string
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

        if (isError(versions)) {
            throw versions
        }

        if (!authStatus_.authenticated) {
            throw new Error('not authenticated')
        }

        const requestParams = {
            apiVersion: versions.codyAPIVersion,
            interactionId,
            customHeaders: {},
        }

        // TODO: We should probably do this check on prompt building instead of here?
        const isClaude = params.model?.match(claudeRegex)?.[1]
        const isFireworks = params?.model?.startsWith('fireworks')

        // Enabled Fireworks tracing for Sourcegraph teammates.
        // https://readme.fireworks.ai/docs/enabling-tracing
        if (isFireworks && authStatus_.isFireworksTracingEnabled) {
            requestParams.customHeaders = { 'X-Fireworks-Genie': 'true' }
            messages = sanitizeMessages(messages)
        } else if (isClaude && Number.parseFloat(isClaude) < 3.5) {
            // Set api version to 0 (unversion) for Claude models older than 3.5.
            // Example: claude-3-haiku or claude-2-sonnet or claude-2.1-instant v.s. claude-3-5-haiku or 3.5-haiku or 3-7-haiku
            requestParams.apiVersion = 0
        }

        // Older models or API versions look for prepended assistant messages.
        if (requestParams.apiVersion === 0 && messages.at(-1)?.speaker === 'human') {
            messages = messages.concat([{ speaker: 'assistant' }])
        }

        const completionParams = {
            ...DEFAULT_CHAT_COMPLETION_PARAMETERS,
            ...params,
            // We only want to send up the speaker and prompt text, regardless of whatever other fields
            // might be on the messages objects (`file`, `displayText`, `contextFiles`, etc.).
            messages: messages.map(({ speaker, text, cacheEnabled, content }) => ({
                text,
                speaker,
                cacheEnabled,
                content,
            })),
        }

        return this.completions.stream(completionParams, requestParams, abortSignal)
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
            (nextMessage.speaker === 'assistant' &&
                !nextMessage.text?.length &&
                !nextMessage.content?.length) ||
            (message.speaker === 'assistant' && !message.text?.length && !message.content?.length)
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
