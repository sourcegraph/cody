import { GROQ_DEFAULT_URL, type GroqCompletionsStreamResponse } from '.'
import { getCompletionsModelConfig } from '../..'
import { onAbort } from '../../common/abortController'
import { CompletionStopReason } from '../../inferenceClient/misc'
import type { CompletionLogger } from '../../sourcegraph-api/completions/client'
import type {
    CompletionCallbacks,
    CompletionParameters,
    CompletionResponse,
} from '../../sourcegraph-api/completions/types'

export function groqChatClient(
    params: CompletionParameters,
    cb: CompletionCallbacks,
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
                content: msg.text ?? '',
            }
        }),
        stream: true,
    }

    // Sends the completion parameters and callbacks to the Ollama API.
    fetch(new URL(GROQ_DEFAULT_URL), {
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

            // Handles the response stream to accumulate the full completion text.
            let insertText = ''
            const textDecoder = new TextDecoder()

            while (true) {
                const { done, value } = await reader.read()
                if (done) {
                    cb.onChange(insertText)
                    cb.onComplete()
                    break
                }

                const chunk = textDecoder.decode(value, { stream: true })
                const lines = chunk.split('\n')

                for (const line of lines) {
                    if (line?.startsWith('data: ')) {
                        const data = line.slice(6)
                        try {
                            const parsedData = JSON.parse(data) as GroqCompletionsStreamResponse
                            const message = parsedData.choices?.[0]?.delta?.content

                            if (message) {
                                insertText += message
                                cb.onChange(insertText)
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
                completion: insertText,
                stopReason: CompletionStopReason.RequestFinished,
            }
            log?.onComplete(completionResponse)
        })
        .catch(error => {
            log?.onError(error)
            cb.onError(error)
        })
}
