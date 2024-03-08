import { OLLAMA_DEFAULT_URL, type OllamaChatParams, type OllamaGenerateResponse } from '.'
import { onAbort } from '../common/abortController'
import { CompletionStopReason } from '../inferenceClient/misc'
import type { CompletionLogger } from '../sourcegraph-api/completions/client'
import type {
    CompletionCallbacks,
    CompletionParameters,
    CompletionResponse,
} from '../sourcegraph-api/completions/types'

/**
 * Calls the Ollama API for chat completions with history.
 *
 * Doc: https://github.com/ollama/ollama/blob/main/docs/api.md#chat-request-with-history
 */
export function ollamaChatClient(
    params: CompletionParameters,
    cb: CompletionCallbacks,
    completionsEndpoint: string,
    logger?: CompletionLogger,
    signal?: AbortSignal
): void {
    const log = logger?.startCompletion(params, completionsEndpoint)
    const model = params.model?.replace('ollama/', '')
    if (!model || !params.messages) {
        log?.onError('No model or messages')
        throw new Error('No model or messages')
    }

    const ollamaChatParams = {
        model,
        messages: params.messages.map(msg => {
            return {
                role: msg.speaker === 'human' ? 'user' : 'assistant',
                content: msg.text ?? '',
            }
        }),
        options: {
            temperature: params.temperature,
            top_k: params.topK,
            top_p: params.topP,
            tfs_z: params.maxTokensToSample,
        },
    } satisfies OllamaChatParams

    // Sends the completion parameters and callbacks to the Ollama API.
    const apiEndpoint = params.apiEndpoint || OLLAMA_DEFAULT_URL
    fetch(new URL('/api/chat', apiEndpoint).href, {
        method: 'POST',
        body: JSON.stringify(ollamaChatParams),
        headers: {
            'Content-Type': 'application/json',
        },
        signal,
    }).then(async response => {
        if (!response.body) {
            log?.onError('No response body')
            throw new Error('No response body')
        }

        const reader = response.body.getReader()

        onAbort(signal, () => reader.cancel())

        // Handles the response stream to accumulate the full completion text.“
        let insertText = ''
        while (true) {
            const { done, value } = await reader.read()
            if (done) {
                cb.onComplete()
                break
            }

            const textDecoder = new TextDecoder()
            const decoded = textDecoder.decode(value, { stream: true })
            const parsedLine = JSON.parse(decoded) as OllamaGenerateResponse

            if (parsedLine.message) {
                insertText += parsedLine.message.content
                cb.onChange(insertText)
            }
        }

        const completionResponse: CompletionResponse = {
            completion: insertText,
            stopReason: CompletionStopReason.RequestFinished,
        }
        log?.onComplete(completionResponse)
    })
}
