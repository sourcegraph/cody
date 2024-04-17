import {
    type BrowserOrNodeResponse,
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    type CompletionLogger,
    type CompletionResponse,
    type CompletionResponseGenerator,
    CompletionStopReason,
    type CompletionsClientConfig,
    FeatureFlag,
    NetworkError,
    RateLimitError,
    TracedError,
    addTraceparent,
    createSSEIterator,
    featureFlagProvider,
    getActiveTraceAndSpanId,
    isAbortError,
    isNodeResponse,
    isRateLimitError,
    logResponseHeadersToSpan,
    recordErrorToSpan,
    tracer,
} from '@sourcegraph/cody-shared'

import { SpanStatusCode } from '@opentelemetry/api'
import { fetch } from '@sourcegraph/cody-shared'

/**
 * Access the code completion LLM APIs via a Sourcegraph server instance.
 */
export function createClient(
    config: CompletionsClientConfig,
    logger?: CompletionLogger
): CodeCompletionsClient {
    function complete(
        params: CodeCompletionsParams,
        abortController: AbortController
    ): CompletionResponseGenerator {
        const url = new URL('/.api/completions/code', config.serverEndpoint).href
        const log = logger?.startCompletion(params, url)
        const { signal } = abortController

        return tracer.startActiveSpan(
            `POST ${url}`,
            async function* (span): CompletionResponseGenerator {
                const tracingFlagEnabled = await featureFlagProvider.evaluateFeatureFlag(
                    FeatureFlag.CodyAutocompleteTracing
                )

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
                span.setAttribute('enableStreaming', enableStreaming)

                // Disable gzip compression since the sg instance will start to batch
                // responses afterwards.
                if (enableStreaming) {
                    headers.set('Accept-Encoding', 'gzip;q=0')
                }

                const response = await fetch(url, {
                    method: 'POST',
                    body: JSON.stringify({
                        ...params,
                        stream: enableStreaming,
                    }),
                    headers,
                    signal,
                })

                logResponseHeadersToSpan(span, response)

                const traceId = getActiveTraceAndSpanId()?.traceId

                // When rate-limiting occurs, the response is an error message
                if (response.status === 429) {
                    // Check for explicit false, because if the header is not set, there is no upgrade
                    // available.
                    //
                    // Note: This header is added only via the Sourcegraph instance and thus not added by
                    //       the helper function.
                    const upgradeIsAvailable =
                        response.headers.get('x-is-cody-pro-user') === 'false' &&
                        typeof response.headers.get('x-is-cody-pro-user') !== 'undefined'
                    throw recordErrorToSpan(
                        span,
                        await createRateLimitErrorFromResponse(response, upgradeIsAvailable)
                    )
                }

                if (!response.ok) {
                    throw recordErrorToSpan(
                        span,
                        new NetworkError(response, await response.text(), traceId)
                    )
                }

                if (response.body === null) {
                    throw recordErrorToSpan(span, new TracedError('No response body', traceId))
                }

                // For backward compatibility, we have to check if the response is an SSE stream or a
                // regular JSON payload. This ensures that the request also works against older backends
                const isStreamingResponse = response.headers.get('content-type') === 'text/event-stream'

                let completionResponse: CompletionResponse | undefined = undefined

                try {
                    if (isStreamingResponse && isNodeResponse(response)) {
                        const iterator = createSSEIterator(response.body, {
                            aggregatedCompletionEvent: true,
                        })
                        let chunkIndex = 0

                        for await (const { event, data } of iterator) {
                            if (event === 'error') {
                                throw new TracedError(data, traceId)
                            }

                            if (signal.aborted) {
                                if (completionResponse) {
                                    completionResponse.stopReason = CompletionStopReason.RequestAborted
                                }

                                break
                            }

                            if (event === 'completion') {
                                completionResponse = JSON.parse(data) as CompletionResponse
                                const stopReason =
                                    completionResponse.stopReason || CompletionStopReason.StreamingChunk
                                span.addEvent('yield', { stopReason })
                                yield {
                                    completion: completionResponse.completion,
                                    stopReason,
                                }
                            }

                            chunkIndex += 1
                        }

                        if (completionResponse === undefined) {
                            throw new TracedError('No completion response received', traceId)
                        }

                        if (!completionResponse.stopReason) {
                            completionResponse.stopReason = CompletionStopReason.RequestFinished
                        }

                        return completionResponse
                    }

                    // Handle non-streaming response
                    const result = await response.text()
                    completionResponse = JSON.parse(result) as CompletionResponse

                    if (
                        typeof completionResponse.completion !== 'string' ||
                        typeof completionResponse.stopReason !== 'string'
                    ) {
                        const message = `response does not satisfy CodeCompletionResponse: ${result}`
                        log?.onError(message)
                        throw new TracedError(message, traceId)
                    }

                    return completionResponse
                } catch (error) {
                    // Shared error handling for both streaming and non-streaming requests.

                    // In case of the abort error and non-empty completion response, we can
                    // consider the completion partially completed and want to log it to
                    // the Cody output channel via `log.onComplete()` instead of erroring.
                    if (isAbortError(error as Error) && completionResponse) {
                        completionResponse.stopReason = CompletionStopReason.RequestAborted
                        return
                    }

                    recordErrorToSpan(span, error as Error)

                    if (isRateLimitError(error as Error)) {
                        throw error
                    }

                    const message = `error parsing CodeCompletionResponse: ${error}`
                    log?.onError(message, error)
                    throw new TracedError(message, traceId)
                } finally {
                    if (completionResponse) {
                        span.addEvent('return', { stopReason: completionResponse.stopReason })
                        span.setStatus({ code: SpanStatusCode.OK })
                        span.end()
                        log?.onComplete(completionResponse)
                    }
                }
            }
        )
    }

    return {
        complete,
        logger,
        onConfigurationChange(newConfig) {
            config = newConfig
        },
    }
}

export async function createRateLimitErrorFromResponse(
    response: BrowserOrNodeResponse,
    upgradeIsAvailable: boolean
): Promise<RateLimitError> {
    const retryAfter = response.headers.get('retry-after')
    const limit = response.headers.get('x-ratelimit-limit')
    return new RateLimitError(
        'autocompletions',
        await response.text(),
        upgradeIsAvailable,
        limit ? parseInt(limit, 10) : undefined,
        retryAfter
    )
}
