import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatNetworkClientParams } from '..'
import {
    type CompletionResponse,
    CompletionStopReason,
    getCompletionsModelConfig,
    logDebug,
} from '../..'
import { constructGeminiChatMessages } from './utils'

/**
 * The URL for the Gemini API, which is used to interact with the Generative Language API provided by Google.
 * The `{model}` placeholder should be replaced with the specific model being used.
 */
// const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}'

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

    const completionResponse: CompletionResponse = {
        completion: '',
        stopReason: CompletionStopReason.RequestFinished,
    }
    const log = logger?.startCompletion(params, completionsEndpoint)

    try {
        signal?.throwIfAborted()
        const genAI = new GoogleGenerativeAI(config.key)
        const model = genAI.getGenerativeModel({ model: config.model })

        // Construct the messages array for the API
        const messages = await constructGeminiChatMessages(params.messages) // Ensure this line is present and used
        logDebug('Google Chat', 'messages', { verbose: messages })
        const lastMessage = messages.pop()
        if (!lastMessage) {
            return
        }

        const history = messages.filter(m => m.parts.length).map(m => ({ role: m.role, parts: m.parts }))
        const chat = model.startChat({ history })

        const result = await chat.sendMessageStream(lastMessage.parts)
        for await (const chunk of result.stream) {
            signal?.throwIfAborted()
            const chunkText = chunk.text()
            completionResponse.completion += chunkText
            cb.onChange(completionResponse.completion)
        }
    } catch (error) {
        log?.onError(`Response parsing error: ${error}`)
        cb.onError(new Error(`Response parsing error: ${error}`))
    }

    log?.onComplete(completionResponse)
}
