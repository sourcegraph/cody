import type { GroqCompletionsStreamResponse } from '.'
import { getCompletionsModelConfig } from '../..'
import { contextFiltersProvider } from '../../cody-ignore/context-filters-provider'
import { onAbort } from '../../common/abortController'
import { CompletionStopReason } from '../../inferenceClient/misc'
import type { CompletionLogger } from '../../sourcegraph-api/completions/client'
import type {
    CompletionCallbacks,
    CompletionParameters,
    CompletionResponse,
} from '../../sourcegraph-api/completions/types'

const GROQ_CHAT_API_URL = new URL('https://api.groq.com/openai/v1/chat/completions')

/**
 * NOTE: Behind `chat.dev.models` configuration flag for internal dev testing purpose only!
 *
 * Calls the Gork API for chat completions.
 * This also works with the OpenAI API or any OpenAI compatible providers.
 * The endpoint can be changed via the apiEndpoint field in the `chat.dev.models` configuration.
 */
export function groqChatClient(
    params: CompletionParameters,
    cb: CompletionCallbacks,
    // This is used for logging as the completions request is sent to the provider's API
    completionsEndpoint: string,
    logger?: CompletionLogger,
    signal?: AbortSignal
): void {
    const log = logger?.startCompletion(params, completionsEndpoint)
    if (!params.model || !params.messages) {
        log?.onError('No model or messages')
        throw new Error('No model or messages')
    }

    const config = getCompletionsModelConfig(params.model)
    if (!config?.model) {
        cb.onError(new Error(`Unknown model ${params.model}`))
        return
    }

    const chatParams = {
        model: config?.model,
        messages: params.messages.map(msg => {
            return {
                role: msg.speaker === 'human' ? 'user' : 'assistant',
                content: msg.text?.toFilteredString(contextFiltersProvider) ?? '',
            }
        }),
        stream: true,
    }

    fetch(config?.endpoint ?? GROQ_CHAT_API_URL, {
        method: 'POST',
        body: JSON.stringify(chatParams),
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.key}`,
        },
        signal,
    })
        .then(res => res.body?.getReader())
        .then(async reader => {
            if (!reader) {
                log?.onError('No response body')
                throw new Error('No response body')
            }

            onAbort(signal, () => reader.cancel())

            let responseText = ''
            const textDecoder = new TextDecoder()

            // Handles the response stream to accumulate the full completion text.
            while (true) {
                const { done, value } = await reader.read()
                if (done) {
                    cb.onChange(responseText)
                    cb.onComplete()
                    break
                }

                const chunk = textDecoder.decode(value, { stream: true })
                const lines = chunk.split('\n')

                for (const line of lines) {
                    const dataMarker = 'data: '
                    if (line?.startsWith(dataMarker)) {
                        const data = line.slice(dataMarker.length)
                        try {
                            const parsedData = JSON.parse(data) as GroqCompletionsStreamResponse
                            const message = parsedData.choices?.[0]?.delta?.content

                            if (message) {
                                responseText += message
                                cb.onChange(responseText)
                            }

                            if (parsedData.error) {
                                cb.onError(new Error(parsedData.error.message))
                            }
                        } catch (error) {
                            // Skip JSON parsing errors
                        }
                    }
                }
            }

            const completionResponse: CompletionResponse = {
                completion: responseText,
                stopReason: CompletionStopReason.RequestFinished,
            }
            log?.onComplete(completionResponse)
        })
        .catch(error => {
            log?.onError(error)
            cb.onError(error)
        })
}
