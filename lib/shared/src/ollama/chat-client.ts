import { CompletionStopReason } from '../inferenceClient/misc'
import { logDebug } from '../logger'
import type { CompletionLogger } from '../sourcegraph-api/completions/client'
import type {
    CompletionCallbacks,
    CompletionParameters,
    CompletionResponse,
} from '../sourcegraph-api/completions/types'
import { OLLAMA_DEFAULT_URL, type OllamaGenerateResponse } from './completions-client'

export function ollamaChatClient(
    params: CompletionParameters,
    cb: CompletionCallbacks,
    completionsEndpoint: string,
    logger?: CompletionLogger,
    signal?: AbortSignal
): void {
    const lastHumanMessage = params.messages[params.messages.length - 2]?.text || ''
    // Empty string as stop reason
    const stopReason = ''
    const ollamaparams = {
        ...params,
        stop_sequence: [stopReason],
        model: params?.model?.replace('ollama/', ''),
        prompt: lastHumanMessage,
        messages: params.messages.map(msg => {
            return {
                role: msg.speaker === 'human' ? 'user' : 'assistant',
                content: msg.text,
            }
        }),
        stream: true,
        options: {
            temperature: params.temperature,
        },
    }

    const log = logger?.startCompletion(params, completionsEndpoint)

    fetch(new URL('/api/generate', OLLAMA_DEFAULT_URL).href, {
        method: 'POST',
        body: JSON.stringify(ollamaparams),
        headers: {
            'Content-Type': 'application/json',
        },
        signal,
    }).then(async response => {
        if (!response.body) {
            throw new Error('Response body is null')
        }

        let insertText = ''

        const reader = response.body.getReader()

        while (true) {
            const { done, value } = await reader.read()
            if (done) {
                break
            }
            const textDecoder = new TextDecoder()
            const text = textDecoder.decode(value, { stream: true })
            const lines = text.split(/\r?\n/).filter(Boolean)
            for (const line of lines) {
                if (!line) {
                    continue
                }
                const parsedLine = JSON.parse(line) as OllamaGenerateResponse

                if (parsedLine.response) {
                    insertText += parsedLine.response
                    cb.onChange(insertText)
                }

                if (parsedLine.done && parsedLine.total_duration) {
                    logDebug?.('ollama', 'generation done', parsedLine)
                    cb.onComplete()
                }
            }
        }

        const completionResponse: CompletionResponse = {
            completion: insertText,
            stopReason: stopReason || CompletionStopReason.RequestFinished,
        }
        log?.onComplete(completionResponse)
    })
}
