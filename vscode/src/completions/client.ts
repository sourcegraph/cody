import { FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import type {
    CompletionLogger,
    CompletionsClientConfig,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'
import type {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'
import {
    isAbortError,
    isRateLimitError,
    NetworkError,
    RateLimitError,
    TimeoutError,
    TracedError,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'
import { addTraceparent, getActiveTraceAndSpanId } from '@sourcegraph/cody-shared/src/tracing'

import { fetch } from '../fetch'

import { forkSignal } from './utils'

export type CodeCompletionsParams = Omit<CompletionParameters, 'fast'> & { timeoutMs: number }

export interface CodeCompletionsClient {
    complete(
        params: CodeCompletionsParams,
        onPartialResponse?: (incompleteResponse: CompletionResponse) => void,
        signal?: AbortSignal
    ): Promise<CompletionResponse>
    onConfigurationChange(newConfig: CompletionsClientConfig): void
}

/**
 * Access the code completion LLM APIs via a Sourcegraph server instance.
 */
export function createClient(config: CompletionsClientConfig, logger?: CompletionLogger): CodeCompletionsClient {
    function getCodeCompletionsEndpoint(): string {
        return new URL('/.api/completions/code', config.serverEndpoint).href
    }

    function completeWithTimeout(
        params: CodeCompletionsParams,
        onPartialResponse?: (incompleteResponse: CompletionResponse) => void,
        signal?: AbortSignal
    ): Promise<CompletionResponse> {
        const abortController = signal ? forkSignal(signal) : new AbortController()
        return Promise.race([
            complete(params, onPartialResponse, abortController.signal),
            createTimeout(params.timeoutMs).finally(() => {
                // We abort the network request in the next run loop so that the race promise can be
                // rejected with the timeout error before that.
                setTimeout(() => abortController.abort(), 0)
            }),
        ])
    }

    async function complete(
        params: CodeCompletionsParams,
        onPartialResponse?: (incompleteResponse: CompletionResponse) => void,
        signal?: AbortSignal
    ): Promise<CompletionResponse> {
        const url = getCodeCompletionsEndpoint()
        const log = logger?.startCompletion(params, url)

        const tracingFlagEnabled = await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteTracing)

        const headers = new Headers(config.customHeaders)
        // Force HTTP connection reuse to reduce latency.
        // c.f. https://github.com/microsoft/vscode/issues/173861
        headers.set('Connection', 'keep-alive')
        headers.set('Content-Type', 'application/json; charset=utf-8')
        if (config.accessToken) {
            headers.set('Authorization', `token ${config.accessToken}`)
        }
        if (tracingFlagEnabled) {
            headers.set('X-Sourcegraph-Should-Trace', '1')

            addTraceparent(headers)
        }

        // We enable streaming only for Node environments right now because it's hard to make
        // the polyfilled fetch API work the same as it does in the browser.
        //
        // TODO(philipp-spiess): Feature test if the response is a Node or a browser stream and
        // implement SSE parsing for both.
        const isNode = typeof process !== 'undefined'
        const enableStreaming = !!isNode

        // Disable gzip compression since the sg instance will start to batch
        // responses afterwards.
        if (enableStreaming) {
            headers.set('Accept-Encoding', 'gzip;q=0')
        }

        const response: Response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                ...params,
                stream: enableStreaming,
            }),
            headers,
            signal,
        })

        const traceId = getActiveTraceAndSpanId()?.traceId

        // When rate-limiting occurs, the response is an error message
        if (response.status === 429) {
            // Check for explicit false, because if the header is not set, there
            // is no upgrade available.
            const upgradeIsAvailable =
                response.headers.get('x-is-cody-pro-user') === 'false' &&
                typeof response.headers.get('x-is-cody-pro-user') !== undefined
            const retryAfter = response.headers.get('retry-after')
            const limit = response.headers.get('x-ratelimit-limit')
            throw new RateLimitError(
                'autocompletions',
                await response.text(),
                upgradeIsAvailable,
                limit ? parseInt(limit, 10) : undefined,
                retryAfter
            )
        }

        if (!response.ok) {
            throw new NetworkError(response, await response.text(), traceId)
        }

        if (response.body === null) {
            throw new TracedError('No response body', traceId)
        }

        // For backward compatibility, we have to check if the response is an SSE stream or a
        // regular JSON payload. This ensures that the request also works against older backends
        const isStreamingResponse = response.headers.get('content-type') === 'text/event-stream'

        if (isStreamingResponse) {
            let lastResponse: CompletionResponse | undefined
            try {
                // The any cast is necessary because `node-fetch` (The polyfill for fetch we use via
                // `isomorphic-fetch`) does not implement a proper ReadableStream interface but
                // instead exposes a Node Stream.
                //
                // Since we directly require from `isomporphic-fetch` and gate this branch out from
                // non Node environments, the response.body will always be a Node Stream instead
                const iterator = createSSEIterator(response.body as any as AsyncIterableIterator<BufferSource>)

                for await (const chunk of iterator) {
                    if (chunk.event === 'error') {
                        throw new Error(chunk.data)
                    }

                    if (chunk.event === 'completion') {
                        if (signal?.aborted) {
                            break // Stop processing the already received chunks.
                        }

                        lastResponse = JSON.parse(chunk.data) as CompletionResponse
                        onPartialResponse?.(lastResponse)
                    }
                }

                if (lastResponse === undefined) {
                    throw new TracedError('No completion response received', traceId)
                }
                log?.onComplete(lastResponse)

                return lastResponse
            } catch (error) {
                if (isRateLimitError(error as Error)) {
                    throw error
                }
                if (isAbortError(error as Error) && lastResponse) {
                    log?.onComplete(lastResponse)
                }

                const message = `error parsing streaming CodeCompletionResponse: ${error}`
                log?.onError(message, error)
                throw new TracedError(message, traceId)
            }
        } else {
            const result = await response.text()
            try {
                const response = JSON.parse(result) as CompletionResponse

                if (typeof response.completion !== 'string' || typeof response.stopReason !== 'string') {
                    const message = `response does not satisfy CodeCompletionResponse: ${result}`
                    log?.onError(message)
                    throw new TracedError(message, traceId)
                } else {
                    log?.onComplete(response)
                    return response
                }
            } catch (error) {
                const message = `error parsing response CodeCompletionResponse: ${error}, response text: ${result}`
                log?.onError(message, error)
                throw new TracedError(message, traceId)
            }
        }
    }

    return {
        complete: completeWithTimeout,
        onConfigurationChange(newConfig) {
            config = newConfig
        },
    }
}

interface SSEMessage {
    event: string
    data: string
}

const SSE_TERMINATOR = '\n\n'
export async function* createSSEIterator(iterator: AsyncIterableIterator<BufferSource>): AsyncGenerator<SSEMessage> {
    let buffer = ''
    for await (const event of iterator) {
        const messages: SSEMessage[] = []

        const data = new TextDecoder().decode(event)
        buffer += data

        let index: number
        while ((index = buffer.indexOf(SSE_TERMINATOR)) >= 0) {
            const message = buffer.slice(0, index)
            buffer = buffer.slice(index + SSE_TERMINATOR.length)
            messages.push(parseSSEEvent(message))
        }

        // This is a potential optimization because our current backend includes a repetition of the
        // whole prior completion in each event. If more than one event is detected inside a chunk,
        // we can skip all but the last completion events.
        for (let i = 0; i < messages.length; i++) {
            if (
                i + 1 < messages.length &&
                messages[i].event === 'completion' &&
                messages[i + 1].event === 'completion'
            ) {
                continue
            }

            yield messages[i]
        }
    }
}

function parseSSEEvent(message: string): SSEMessage {
    const headers = message.split('\n')

    let event = ''
    let data = ''
    for (const header of headers) {
        const index = header.indexOf(': ')
        const title = header.slice(0, index)
        const rest = header.slice(index + 2)
        switch (title) {
            case 'event':
                event = rest
                break
            case 'data':
                data = rest
                break
            default:
                console.error(`Unknown SSE event type: ${event}`)
        }
    }

    return { event, data }
}

function createTimeout(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => setTimeout(() => reject(new TimeoutError('The request timed out')), timeoutMs))
}
