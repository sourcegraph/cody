import type { GeminiCompletionResponse } from '.'
import type { ChatNetworkClientParams } from '..'
import { getCompletionsModelConfig, logDebug } from '../..'
import { onAbort } from '../../common/abortController'
import { CompletionStopReason } from '../../inferenceClient/misc'
import type { CompletionResponse } from '../../sourcegraph-api/completions/types'
import { constructGeminiChatMessages } from './utils'

/**
 * The URL for the Gemini API, which is used to interact with the Generative Language API provided by Google.
 * The `{model}` placeholder should be replaced with the specific model being used.
 */
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}'

/**
 * NOTE: Behind `chat.dev.models` configuration flag for internal dev testing purpose only!
 *
 * Calls the Google API for chat completions with history.
 * REF: https://ai.google.dev/tutorials/rest_quickstart#multi-turn_conversations_chat
 */
export async function googleChatClient({
    params,
    cb,
    completionsEndpoint,
    logger,
    signal,
}: ChatNetworkClientParams): Promise<void> {
    if (!params.model) {
        return
    }

    const config = getCompletionsModelConfig(params.model)
    if (!config?.key) {
        cb.onError(new Error(`API key must be provided to use Google Chat model ${params.model}`))
        return
    }

    const log = logger?.startCompletion(params, completionsEndpoint)

    // Add the stream endpoint to the URL
    const apiEndpoint = new URL(GEMINI_API_URL.replace('{model}', config.model))
    apiEndpoint.pathname += ':streamGenerateContent'
    apiEndpoint.searchParams.append('alt', 'sse')
    apiEndpoint.searchParams.append('key', config.key)

    // Construct the messages array for the API
    const messages = await constructGeminiChatMessages(params.messages)

    // Sends the completion parameters and callbacks to the API.
    fetch(apiEndpoint, {
        method: 'POST',
        body: JSON.stringify({ contents: messages }),
        headers: {
            'Content-Type': 'application/json',
        },
        signal,
    })
        .then(async response => {
            if (!response.body) {
                throw new Error('No response body')
            }

            const reader = response.body.getReader()
            onAbort(signal, () => reader.cancel())

            let responseText = ''

            // Handles the response stream to accumulate the full completion text.
            while (true) {
                if (!response.ok) {
                    let body: string | undefined
                    try {
                        const textDecoder = new TextDecoder()
                        body = textDecoder.decode((await reader.read()).value)
                    } catch (error) {
                        logDebug('googleChatClient', `error reading body: ${error}`)
                    }
                    logDebug(
                        'googleChatClient',
                        `HTTP ${response.status} Error: ${response.statusText}${
                            body ? ` — body: ${JSON.stringify(body)}` : ''
                        }`
                    )
                    throw new Error(`HTTP ${response.status} Error: ${response.statusText}`)
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
                        const parsed = JSON.parse(jsonString) as GeminiCompletionResponse
                        const streamText = parsed.candidates?.[0]?.content?.parts[0]?.text
                        if (streamText) {
                            responseText += streamText
                            cb.onChange(responseText)
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
