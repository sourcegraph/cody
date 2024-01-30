import { isDefined } from '../common'
import type { OllamaGenerateParameters, OllamaOptions } from '../configuration'
import {
    STOP_REASON_STREAMING_CHUNK,
    type CodeCompletionsClient,
    type CompletionResponseGenerator,
} from '../inferenceClient/misc'
import type { CompletionLogger } from '../sourcegraph-api/completions/client'
import { isAbortError } from '../sourcegraph-api/errors'
import { isNodeResponse } from '../sourcegraph-api/graphql/client'
import { isError } from '../utils'

/**
 * @see https://sourcegraph.com/github.com/jmorganca/ollama/-/blob/api/types.go?L35
 */
export interface OllamaGenerateParams {
    model: string
    template: string
    prompt: string
    options?: OllamaGenerateParameters
}

/**
 * @see https://sourcegraph.com/github.com/jmorganca/ollama/-/blob/api/types.go?L88
 */
interface OllamaGenerateResponse {
    model: string
    response?: string
    done: boolean
    context?: number[]
    total_duration?: number
    load_duration?: number
    prompt_eval_count?: number
    prompt_eval_duration?: number
    eval_count?: number
    eval_duration?: number
    sample_count?: number
    sample_duration?: number
}

interface OllamaGenerateErrorResponse {
    error?: string
}

const RESPONSE_SEPARATOR = /\r?\n/

/**
 * The implementation is based on the `createClient` function from
 * `vscode/src/completions/client.ts` with some duplication.
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
        const url = new URL('/api/generate', ollamaOptions.url).href
        const log = logger?.startCompletion(params, url)

        try {
            const response = await fetch(url, {
                method: 'POST',
                body: JSON.stringify(params),
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: abortController.signal,
            })

            if (!response.ok) {
                const errorResponse = (await response.json()) as OllamaGenerateErrorResponse
                throw new Error(`ollama generation error: ${errorResponse?.error || 'unknown error'}`)
            }

            if (!response.body) {
                throw new Error('no response body')
            }

            const iterableBody = isNodeResponse(response)
                ? response.body
                : browserResponseToAsyncIterable(response.body)

            let responseText = ''

            for await (const chunk of iterableBody) {
                for (const chunkString of chunk.toString().split(RESPONSE_SEPARATOR).filter(Boolean)) {
                    const line = JSON.parse(chunkString) as OllamaGenerateResponse

                    if (line.response) {
                        responseText += line.response
                        yield { completion: responseText, stopReason: STOP_REASON_STREAMING_CHUNK }
                    }

                    if (line.done && line.total_duration) {
                        const timingInfo = formatOllamaTimingInfo(line)
                        // TODO(valery): yield debug message with timing info to a tracer
                        logDebug?.('ollama', 'generation done', timingInfo.join(' '))
                    }
                }
            }

            log?.onComplete(responseText)

            return { completion: responseText, stopReason: '' }
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

function browserResponseToAsyncIterable(body: ReadableStream<Uint8Array>): {
    [Symbol.asyncIterator]: () => AsyncGenerator<string, string, unknown>
} {
    return {
        [Symbol.asyncIterator]: async function* () {
            const reader = body.getReader()
            const decoder = new TextDecoder('utf-8')

            while (true) {
                const { value, done } = await reader.read()
                const decoded = decoder.decode(value, { stream: true })

                if (done) {
                    return decoded
                }

                yield decoded
            }
        },
    }
}
