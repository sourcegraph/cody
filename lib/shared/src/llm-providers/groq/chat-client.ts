import type { GroqCompletionsStreamResponse } from '.'
import type { ChatNetworkClientParams } from '..'
import { getCompletionsModelConfig } from '../..'
import { contextFiltersProvider } from '../../cody-ignore/context-filters-provider'
import { onAbort } from '../../common/abortController'
import { CompletionStopReason } from '../../inferenceClient/misc'
import type { CompletionResponse } from '../../sourcegraph-api/completions/types'

const GROQ_CHAT_API_URL = new URL('https://api.groq.com/openai/v1/chat/completions')

/**
 * NOTE: Behind `chat.dev.models` configuration flag for internal dev testing purpose only!
 *
 * Calls the Gork API for chat completions.
 * This also works with the OpenAI API or any OpenAI compatible providers.
 * The endpoint can be changed via the apiEndpoint field in the `chat.dev.models` configuration.
 */
export async function groqChatClient({
    params,
    cb,
    completionsEndpoint,
    logger,
    signal,
}: ChatNetworkClientParams): Promise<void> {
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

    // Support [Cortex](https://jan.ai/cortex) experimentally, which commonly uses this port.
    const isCortex = config?.endpoint?.includes(':1337')

    const chatParams = {
        model: config?.model,
        messages: await Promise.all(
            params.messages.map(async msg => {
                return {
                    role: msg.speaker === 'human' ? 'user' : 'assistant',
                    content: (await msg.text?.toFilteredString(contextFiltersProvider.instance!)) ?? '',
                }
            })
        ),
        stream: true,
        ...(isCortex
            ? {
                  max_tokens: 1000,
                  stop: [],
                  frequency_penalty: 0,
                  presence_penalty: 0,
                  temperature: 0.1,
                  top_p: -1,
              }
            : {}),
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
        .then(async res => {
            if (!res.ok) {
                log?.onError(res.statusText)
                throw new Error(`HTTP ${res.status} ${res.statusText}: ${await res.text()}`)
            }
            return res
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
