import { type ContextItem, isAbortError, isError, logDebug } from '../..'
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

import { type CachedContent, type Content, GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAICacheManager } from '@google/generative-ai/server'

/**
 * Completion client for Code Completion with Context Caching.
 * NOTE: Behind `chat.dev.models` configuration flag.
 */
export function createGoogleCacheClient(
    model: string,
    apiKey: string,
    initContext: ContextItem[],
    logger?: CompletionLogger
): CodeCompletionsClient<CodeCompletionsParams> {
    const google = new GoogleGenerativeAI(apiKey)
    const googleModel = google.getGenerativeModel({ model })
    const cacheManager = new GoogleAICacheManager(apiKey)

    let cached: CachedContent | undefined
    let cachedToken = 0

    const contents: Content[] = []
    for (const item of initContext) {
        if (item.content) {
            contents.push({
                role: 'user',
                parts: [{ text: item.content }],
            })
            googleModel.countTokens(item.content).then(tokenCount => {
                cachedToken += tokenCount.totalTokens
            })
        }
    }

    logDebug('GoogleAPICodeClient', `added ${cachedToken} tokens to cache`)

    async function getCache(): Promise<CachedContent> {
        return (
            cached ??
            (await cacheManager.create({
                model,
                // caching for 2 minutes
                ttlSeconds: 120,
                displayName: 'Cody Cache Test',
                systemInstruction:
                    'You are a code completion AI, designed to autofill code enclosed in special markers based on provided context.',
                contents,
            }))
        )
    }

    async function* complete(
        params: CodeCompletionsParams,
        abortController: AbortController
    ): CompletionResponseGenerator {
        if (cachedToken < 32768) {
            throw new Error('CACHE FAIL: Not enough tokens for context cache.')
        }

        const cache = await getCache()

        const prompt = (await getGeminiCompletionPrompt(params.messages)) ?? ''
        const geminiClient = google.getGenerativeModelFromCachedContent(cache)

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
