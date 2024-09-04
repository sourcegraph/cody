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
    type SerializedCodeCompletionsParams,
    TracedError,
    addTraceparent,
    createSSEIterator,
    featureFlagProvider,
    getActiveTraceAndSpanId,
    getClientInfoParams,
    isAbortError,
    isNodeResponse,
    isRateLimitError,
    logResponseHeadersToSpan,
    recordErrorToSpan,
    tracer,
} from '@sourcegraph/cody-shared'

import { SpanStatusCode } from '@opentelemetry/api'
import { contextFiltersProvider, fetch } from '@sourcegraph/cody-shared'
import type {
    CodeCompletionProviderOptions,
    CompletionResponseWithMetaData,
} from '@sourcegraph/cody-shared/src/inferenceClient/misc'

/**
 * Access the code completion LLM APIs via a Sourcegraph server instance.
 */
export function createClient(
    config: CompletionsClientConfig,
    logger?: CompletionLogger
): CodeCompletionsClient {
    function complete(
        { timeoutMs, ...params }: CodeCompletionsParams,
        abortController: AbortController,
        providerOptions: CodeCompletionProviderOptions
    ): CompletionResponseGenerator {
        const query = new URLSearchParams(getClientInfoParams())
        const url = new URL(`/.api/completions/code?${query.toString()}`, config.serverEndpoint).href
        const log = logger?.startCompletion(params, url)
        const { signal } = abortController

        return tracer.startActiveSpan(
            `POST ${url}`,
            async function* (span): CompletionResponseGenerator {
                const tracingFlagEnabled = await featureFlagProvider.instance!.evaluateFeatureFlag(
                    FeatureFlag.CodyAutocompleteTracing
                )

                const headers = new Headers({
                    ...config.customHeaders,
                    ...providerOptions?.customHeaders,
                })

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

                headers.set('X-Timeout-Ms', timeoutMs.toString())

                const serializedParams: SerializedCodeCompletionsParams & {
                    stream: boolean
                } = {
                    ...params,
                    stream: enableStreaming,
                    messages: await Promise.all(
                        params.messages.map(async m => ({
                            ...m,
                            text: await m.text?.toFilteredString(contextFiltersProvider.instance!),
                        }))
                    ),
                }

                const response = await fetch(url, {
                    method: 'POST',
                    body: JSON.stringify(serializedParams),
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

                const result: CompletionResponseWithMetaData = {
                    completionResponse: undefined,
                    metadata: { response },
                }

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
                                if (result.completionResponse) {
                                    result.completionResponse.stopReason =
                                        CompletionStopReason.RequestAborted
                                }

                                break
                            }

                            if (event === 'completion') {
                                const parsed = JSON.parse(data) as CompletionResponse
                                result.completionResponse = {
                                    completion: parsed.completion || '',
                                    stopReason: parsed.stopReason || CompletionStopReason.StreamingChunk,
                                }

                                span.addEvent('yield', {
                                    charCount: result.completionResponse.completion.length,
                                    stopReason: result.completionResponse.stopReason,
                                })

                                yield result
                            }

                            chunkIndex += 1
                        }

                        if (result.completionResponse === undefined) {
                            throw new TracedError('No completion response received', traceId)
                        }

                        if (!result.completionResponse.stopReason) {
                            result.completionResponse.stopReason = CompletionStopReason.RequestFinished
                        }

                        return result
                    }

                    // Handle non-streaming response
                    const text = await response.text()
                    result.completionResponse = JSON.parse(text) as CompletionResponse

                    if (
                        typeof result.completionResponse.completion !== 'string' ||
                        typeof result.completionResponse.stopReason !== 'string'
                    ) {
                        const message = `response does not satisfy CodeCompletionResponse: ${text}`
                        log?.onError(message)
                        throw new TracedError(message, traceId)
                    }

                    return result
                } catch (error) {
                    // Shared error handling for both streaming and non-streaming requests.

                    // In case of the abort error and non-empty completion response, we can
                    // consider the completion partially completed and want to log it to
                    // the Cody output channel via `log.onComplete()` instead of erroring.
                    if (isAbortError(error as Error) && result.completionResponse) {
                        result.completionResponse.stopReason = CompletionStopReason.RequestAborted
                        return result
                    }

                    recordErrorToSpan(span, error as Error)

                    if (isRateLimitError(error as Error)) {
                        throw error
                    }

                    const message = `error parsing CodeCompletionResponse: ${error}`
                    log?.onError(message, error)
                    throw new TracedError(message, traceId)
                } finally {
                    if (result.completionResponse) {
                        span.addEvent('return', {
                            charCount: result.completionResponse.completion.length,
                            stopReason: result.completionResponse.stopReason,
                        })
                        span.setStatus({ code: SpanStatusCode.OK })
                        span.end()
                        log?.onComplete(result.completionResponse)
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
        limit ? Number.parseInt(limit, 10) : undefined,
        retryAfter
    )
}
