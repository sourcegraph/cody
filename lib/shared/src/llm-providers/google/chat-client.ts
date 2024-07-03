import type { ChatNetworkClientParams } from '..'
import { getCompletionsModelConfig } from '../..'
import { onAbort } from '../../common/abortController'
import { CompletionStopReason } from '../../inferenceClient/misc'
import { constructGeminiChatMessages } from './utils'

import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * NOTE: Behind `chat.dev.models` configuration flag for internal dev testing purpose only!
 *
 * Sends a completion request to the Google Chat model and streams the response back to the caller.
 *
 * @param params - The completion parameters, including the model to use and the input messages.
 * @param cb - The completion callbacks, used to notify the caller of progress and errors.
 * @param completionsEndpoint - The URL of the completions endpoint.
 * @param logger - An optional logger to track the completion request.
 * @param signal - An optional abort signal to cancel the request.
 * @returns A Promise that resolves when the completion is finished or an error occurs.
 */
export async function googleChatClient({
    params,
    cb,
    completionsEndpoint,
    logger,
    signal,
}: ChatNetworkClientParams): Promise<void> {
    const { model, messages } = params
    const config = getCompletionsModelConfig(model!)
    if (!config?.key || !model) {
        cb.onError(new Error(`API key must be provided to use Google Chat model ${model}`))
        return
    }
    // This is used for logging as the completions request is sent to the provider's API
    const log = logger?.startCompletion(params, completionsEndpoint)
    onAbort(signal, () => log?.onError('Request aborted'))

    try {
        const google = new GoogleGenerativeAI(config.key)
        const geminiClient = google.getGenerativeModel({ model: config.model })

        const history = await constructGeminiChatMessages(messages)
        const lastMessage = history.pop()?.parts[0].text ?? ''

        const chat = geminiClient.startChat({ history })
        const response = await chat.sendMessageStream(lastMessage)

        let completion = ''
        for await (const chunk of response.stream) {
            completion += chunk.text()
            cb.onChange(completion)
        }

        log?.onComplete({ completion, stopReason: CompletionStopReason.RequestFinished })
    } catch (error) {
        const errorMessage = signal?.aborted ? 'Request aborted' : `${error}`
        log?.onError(errorMessage)
        cb.onError(error as Error)
    }
}
