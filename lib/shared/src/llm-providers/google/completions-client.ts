import { getCompletionsModelConfig, isAbortError, isError, logDebug } from '../..'
import { onAbort } from '../../common/abortController'
import {
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    type CompletionResponseGenerator,
    CompletionStopReason,
} from '../../inferenceClient/misc'
import type { CompletionLogger } from '../../sourcegraph-api/completions/client'
import type { CompletionResponse } from '../../sourcegraph-api/completions/types'
import { getGeminiCompletionPrompt } from './utils'

import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * NOTE: Behind `chat.dev.models` configuration flag.
 */
export function createGoogleAPIClient(
    logger?: CompletionLogger
): CodeCompletionsClient<CodeCompletionsParams> {
    async function* complete(
        params: CodeCompletionsParams,
        abortController: AbortController
    ): CompletionResponseGenerator {
        const model = params.model || 'gemini-1.5-flash'
        const config = getCompletionsModelConfig(`google/${model}`)
        if (!config?.key) {
            logDebug('createGoogleClient', 'Error: API key must be provided to use Google Chat model')
            return
        }

        const prompt = (await getGeminiCompletionPrompt(params.messages)) ?? ''
        const generationConfig = {
            stopSequences: params.stopSequences,
            maxOutputTokens: params.maxTokensToSample,
            temperature: 0.9,
            topP: 0.1,
            topK: 16,
        }

        const google = new GoogleGenerativeAI(config.key)
        const geminiClient = google.getGenerativeModel({ model: config.model, generationConfig })

        const { signal } = abortController
        const log = logger?.startCompletion(params, model)
        onAbort(signal, () => log?.onError('Request aborted'))

        try {
            const result: CompletionResponse = {
                completion: '',
                stopReason: CompletionStopReason.StreamingChunk,
            }

            const response = await geminiClient.generateContentStream([prompt])
            for await (const chunk of response.stream) {
                result.completion += chunk.text()
            }

            result.stopReason = CompletionStopReason.RequestFinished
            log?.onComplete(result)
            return result
        } catch (error) {
            if (!isAbortError(error) && isError(error)) {
                log?.onError(error.message, error)
            }

            throw error
        }
    }

    return {
        complete,
        logger,
        onConfigurationChange: () => undefined,
    }
}
