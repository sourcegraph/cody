import { Ollama } from 'ollama/browser'
import type { OllamaGenerateParams, OllamaGenerateResponse } from '.'
import { contextFiltersProvider } from '../../cody-ignore/context-filters-provider'
import { isDefined } from '../../common'
import type { OllamaOptions } from '../../configuration'
import {
    type CodeCompletionsClient,
    type CompletionResponseGenerator,
    CompletionStopReason,
} from '../../inferenceClient/misc'
import type { CompletionLogger } from '../../sourcegraph-api/completions/client'
import type { CompletionResponse } from '../../sourcegraph-api/completions/types'
import { isAbortError } from '../../sourcegraph-api/errors'
import { isError } from '../../utils'

/**
 * The client for Ollama's generate endpoint.
 */
export function createOllamaClient(
    ollamaOptions: OllamaOptions,
    logger?: CompletionLogger,
    logDebug?: (filterLabel: string, text: string, ...args: unknown[]) => void
): CodeCompletionsClient<OllamaGenerateParams> {
    async function* complete(
        params: OllamaGenerateParams,
        abortController: AbortController
    ): CompletionResponseGenerator {
        const url = new URL(ollamaOptions.url).href
        const ollama = new Ollama({ host: url })
        const model = params.model

        const log = logger?.startCompletion(params, url)
        const { signal } = abortController

        try {
            const prompt = await params.prompt.toFilteredString(contextFiltersProvider)

            const res = await ollama.generate({
                model,
                prompt,
                options: params.options,
                stream: true,
            })

            const completionResponse: CompletionResponse = {
                completion: '',
                stopReason: CompletionStopReason.StreamingChunk,
            }

            for await (const line of res) {
                if (line.response) {
                    completionResponse.completion += line.response
                    yield {
                        completionResponse,
                    }
                }

                if (signal?.aborted) {
                    completionResponse.stopReason = CompletionStopReason.RequestAborted
                    ollama.abort()
                    break
                }

                if (line.done) {
                    completionResponse.stopReason = CompletionStopReason.RequestFinished

                    if (line.total_duration) {
                        // TODO(valery): yield debug message with timing info to a tracer
                        const timingInfo = formatOllamaTimingInfo(line)
                        logDebug?.('ollama', 'generation done', timingInfo.join(' '))
                    }
                }
            }

            completionResponse.stopReason = CompletionStopReason.RequestFinished
            log?.onComplete(completionResponse)

            return { completionResponse }
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
    }
}

function formatOllamaTimingInfo(response: OllamaGenerateResponse): string[] {
    const timingMetricsKeys: (keyof OllamaGenerateResponse)[] = [
        'total_duration',
        'load_duration',
        'prompt_eval_count',
        'prompt_eval_duration',
        'eval_count',
        'eval_duration',
        'sample_count',
        'sample_duration',
    ]

    const formattedMetrics = timingMetricsKeys
        .filter(key => response[key] !== undefined)
        .map(key => {
            const value = response[key]
            const formattedValue = key.endsWith('_duration') ? `${(value as number) / 1000000}ms` : value
            return `${key}=${formattedValue}`
        })

    const promptEvalSpeed =
        response.prompt_eval_count !== undefined && response.prompt_eval_duration !== undefined
            ? `prompt_eval_tok/sec=${
                  response.prompt_eval_count / (response.prompt_eval_duration / 1000000000)
              }`
            : null

    const responseEvalSpeed =
        response.eval_count !== undefined && response.eval_duration !== undefined
            ? `response_tok/sec=${response.eval_count / (response.eval_duration / 1000000000)}`
            : null

    return [...formattedMetrics, promptEvalSpeed, responseEvalSpeed].filter(isDefined)
}
