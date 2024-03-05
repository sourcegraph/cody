import { onAbort } from '../common/abortController'
import { CompletionStopReason } from '../inferenceClient/misc'
import { logDebug } from '../logger'
import type { CompletionLogger } from '../sourcegraph-api/completions/client'
import type {
    CompletionCallbacks,
    CompletionParameters,
    CompletionResponse,
} from '../sourcegraph-api/completions/types'
import { OLLAMA_DEFAULT_URL, type OllamaGenerateResponse } from './completions-client'

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
    // Empty string as stop reason
    const stopReason = ''
    const ollamaparams = {
        model: params?.model?.replace('ollama/', ''),
        messages: params.messages.map(msg => {
            return {
                role: msg.speaker === 'human' ? 'user' : 'assistant',
                content: msg.text,
            }
        }),
        options: {
            temperature: params.temperature,
            top_k: params.topK,
            top_p: params.topP,
            tfs_z: params.maxTokensToSample,
        },
    }
    // Sends the completion parameters and callbacks to the Ollama API.
    fetch(new URL('/api/chat', OLLAMA_DEFAULT_URL).href, {
        method: 'POST',
        body: JSON.stringify(ollamaparams),
        headers: {
            'Content-Type': 'application/json',
        },
        signal,
    }).then(async response => {
        const log = logger?.startCompletion(params, completionsEndpoint)
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

            if (parsedLine.done && parsedLine.total_duration) {
                logDebug?.('ollama', 'generation done', parsedLine)
                cb.onComplete()
                break
            }
        }

        const completionResponse: CompletionResponse = {
            completion: insertText,
            stopReason: stopReason || CompletionStopReason.RequestFinished,
        }
        log?.onComplete(completionResponse)
    })
}
