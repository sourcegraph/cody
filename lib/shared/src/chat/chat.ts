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

        const requestParams = buildChatRequestParams({
            model: params.model,
            codyAPIVersion: versions.codyAPIVersion,
            isFireworksTracingEnabled: !!authStatus_.isFireworksTracingEnabled,
            interactionId,
        })

        // Sanitize messages before sending them to the completions API.
        messages = sanitizeMessages(messages)

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
        } as CompletionParameters

        return this.completions.stream(completionParams, requestParams, abortSignal)
    }
}

/**
 * Sanitizes an array of conversation messages to ensure proper formatting for model processing.
 *
 * Performs three cleaning operations:
 * 1. Removes trailing empty assistant messages
 * 2. Removes pairs of messages where an assistant message in the middle has empty content
 *    (also removes the preceding message that prompted the empty response)
 * 3. Trims trailing whitespace from the final assistant message
 *
 * @param messages - The array of Message objects representing the conversation
 * @returns A new array with sanitized messages
 */
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

/**
 * Builds the request parameters for the chat API.
 *
 * @param options - The options for building the chat request parameters.
 * @returns The request parameters for the chat API.
 */
export function buildChatRequestParams({
    model,
    codyAPIVersion,
    isFireworksTracingEnabled,
    interactionId,
}: {
    model?: string
    codyAPIVersion: number
    isFireworksTracingEnabled: boolean
    interactionId?: string
}): { apiVersion: number; interactionId?: string; customHeaders: Record<string, string> } {
    const requestParams = { apiVersion: codyAPIVersion, interactionId, customHeaders: {} }

    // Enabled Fireworks tracing for Sourcegraph teammates.
    // https://readme.fireworks.ai/docs/enabling-tracing
    if (model?.startsWith('fireworks') && isFireworksTracingEnabled) {
        requestParams.customHeaders = { 'X-Fireworks-Genie': 'true' }
    }

    return requestParams
}
