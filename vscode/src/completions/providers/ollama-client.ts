import { isDefined } from '@sourcegraph/cody-shared'
import type { OllamaGenerateParameters, OllamaOptions } from '@sourcegraph/cody-shared/src/configuration'
import type { CompletionLogger } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'
import type { CompletionResponse } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'
import { isAbortError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'
import { isNodeResponse, type BrowserOrNodeResponse } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { logDebug } from '../../log'
import { createTimeout, type CodeCompletionsClient } from '../client'
import { forkSignal } from '../utils'

/**
 * @see https://sourcegraph.com/github.com/jmorganca/ollama/-/blob/api/types.go?L35
 */
interface OllamaGenerateParams {
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

export interface OllamaClientParams extends OllamaGenerateParams {
    timeoutMs: number
}

/**
 * The implementation is based on the `createClient` function from
 * `vscode/src/completions/client.ts` with some duplication.
 */
export function createOllamaClient(
    ollamaOptions: OllamaOptions,
    logger?: CompletionLogger
): CodeCompletionsClient<OllamaClientParams> {
    function completeWithTimeout(
        params: OllamaClientParams,
        onPartialResponse: (incompleteResponse: CompletionResponse) => void,
        signal?: AbortSignal
    ): Promise<CompletionResponse> {
        const abortController = signal ? forkSignal(signal) : new AbortController()
        const { timeoutMs, ...restParams } = params

        return Promise.race([
            complete(restParams, onPartialResponse, abortController.signal),
            createTimeout(timeoutMs).finally(() => {
                // We abort the network request in the next run loop so that the race promise can be
                // rejected with the timeout error before that.
                setTimeout(() => abortController.abort(), 0)
            }),
        ])
    }

    async function complete(
        params: Omit<OllamaClientParams, 'timeoutMs'>,
        onPartialResponse: (incompleteResponse: CompletionResponse) => void,
        signal?: AbortSignal
    ): Promise<CompletionResponse> {
        const url = new URL('/api/generate', ollamaOptions.url).href
        const log = logger?.startCompletion(params, url)

        try {
            const response = await fetch(url, {
                method: 'POST',
                body: JSON.stringify(params),
                headers: {
                    'Content-Type': 'application/json',
                },
                signal,
            })

            if (!response.ok) {
                const errorResponse = (await response.json()) as OllamaGenerateErrorResponse
                throw new Error(`ollama generation error: ${errorResponse?.error || 'unknown error'}`)
            }

            const { responseText } = await ollamaStreamToResponseText(response, onPartialResponse)
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
        complete: completeWithTimeout,
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        onConfigurationChange() {},
    }
}

const RESPONSE_SEPARATOR = /\r?\n/

interface OllamaStreamToResponseTextResult {
    responseText: string
}

async function ollamaStreamToResponseText(
    response: BrowserOrNodeResponse,
    onPartialResponse: (incompleteResponse: CompletionResponse) => void
): Promise<OllamaStreamToResponseTextResult> {
    if (!response.body) {
        throw new Error('no response body')
    }

    let responseText = ''
    const iterableBody = isNodeResponse(response) ? response.body : browserResponseToAsyncIterable(response.body)

    for await (const chunk of iterableBody) {
        chunk
            .toString()
            .split(RESPONSE_SEPARATOR)
            .filter(Boolean)
            .forEach(chunkString => {
                const line = JSON.parse(chunkString)

                if (line.response) {
                    responseText += line.response
                    onPartialResponse({ completion: responseText, stopReason: '' })
                }

                if (line.done && line.total_duration) {
                    const timingInfo = formatOllamaTimingInfo(line)
                    // TODO(valery): pass timing info as a debug message to a tracer.
                    logDebug('ollama', 'generation done', timingInfo.join(' '))
                }
            })
    }

    return { responseText }
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
            ? `prompt_eval_tok/sec=${response.prompt_eval_count / (response.prompt_eval_duration / 1000000000)}`
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
        // eslint-disable-next-line object-shorthand
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
