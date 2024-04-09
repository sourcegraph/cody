import { onAbort } from '../common/abortController'
import { CompletionStopReason } from '../inferenceClient/misc'
import type { CompletionLogger } from '../sourcegraph-api/completions/client'
import type {
    CompletionCallbacks,
    CompletionParameters,
    CompletionResponse,
} from '../sourcegraph-api/completions/types'

interface GoogleChatResponse {
    candidates: {
        content: {
            parts: { text: string }[]
            role: string
        }
        finishReason: string
        index: number
        safetyRatings: {
            category: string
            probability: string
        }[]
    }[]
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}'

/**
 * Calls the Google API for chat completions with history.
 * https://ai.google.dev/tutorials/rest_quickstart#multi-turn_conversations_chat
 */
export function googleChatClient(
    params: CompletionParameters,
    cb: CompletionCallbacks,
    completionsEndpoint: string,
    logger?: CompletionLogger,
    signal?: AbortSignal
): void {
    if (!params.model || !params.modelAPI?.key) {
        cb.onError(new Error('Model and modelAPIKey must be provided to use Google Chat model.'))
        return
    }

    const log = logger?.startCompletion(params, completionsEndpoint)
    const model = params.model?.replace('google/', '') || 'gemini-pro'
    const key = params.modelAPI?.key
    const apiEndpoint = new URL(GEMINI_API_URL.replace('{model}', model))
    // Add the stream endpoint to the URL
    apiEndpoint.pathname += ':streamGenerateContent'
    apiEndpoint.searchParams.append('alt', 'sse')
    apiEndpoint.searchParams.append('key', key)

    // Construct the messages array for the API
    const messages = params.messages.map(msg => ({
        role: msg.speaker === 'human' ? 'user' : 'model',
        parts: [{ text: msg.text ?? '' }],
    }))
    // Remove the last bot message from the messages array as expected by the API
    if (messages[messages.length - 1].role === 'model') {
        messages.pop()
    }

    // Sends the completion parameters and callbacks to the API.
    fetch(apiEndpoint, {
        method: 'POST',
        body: JSON.stringify({ contents: messages }),
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
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`)
            }

            // Create a streaming json parser to handle this without reading the whole stream first
            const { done, value } = await reader.read()
            const textDecoder = new TextDecoder()
            const decoded = textDecoder.decode(value, { stream: true })
            // Split the stream into individual messages
            const messages = decoded.split(/^data: /).filter(Boolean)
            for (const message of messages) {
                // Remove the "data: " prefix from each message
                const jsonString = message.replace(/^data: /, '').trim()
                try {
                    const parsed = JSON.parse(jsonString) as GoogleChatResponse
                    const responseText = parsed.candidates?.[0]?.content?.parts[0]?.text
                    if (responseText) {
                        insertText += responseText
                        cb.onChange(insertText)
                    }
                } catch (error) {
                    console.error('Error parsing response:', error)
                    log?.onError(`Response parsing error: ${error}`)
                    break
                }
            }

            if (done) {
                cb.onComplete()
                break
            }
        }

        const completionResponse: CompletionResponse = {
            completion: insertText,
            stopReason: CompletionStopReason.RequestFinished,
        }
        log?.onComplete(completionResponse)
    })
}
