import { SpanStatusCode } from '@opentelemetry/api'
import type { AuthStatus } from '../auth/types'
import { fetch } from '../fetch'
import { CompletionStopReason } from '../inferenceClient/misc'
import { logDebug } from '../logger'
import type { CompletionLogger } from '../sourcegraph-api/completions/client'
import type {
    CompletionGeneratorValue,
    CompletionParameters,
    CompletionResponse,
} from '../sourcegraph-api/completions/types'
import {
    NetworkError,
    RateLimitError,
    TracedError,
    isAbortError,
    isRateLimitError,
} from '../sourcegraph-api/errors'
import { type BrowserOrNodeResponse, isNodeResponse } from '../sourcegraph-api/graphql/client'
import {
    addTraceparent,
    getActiveTraceAndSpanId,
    logResponseHeadersToSpan,
    recordErrorToSpan,
    tracer,
} from '../tracing'
import { createSSEIterator } from './sse-iterator'

export function createFastPathClient(
    requestParams: CompletionParameters,
    authStatus: Pick<AuthStatus, 'userCanUpgrade' | 'isDotCom' | 'endpoint'>,
    fastPathAccessToken: string,
    abortSignal?: AbortSignal,
    logger?: CompletionLogger
): AsyncGenerator<CompletionGeneratorValue> {
    const isLocalInstance =
        authStatus.endpoint?.includes('sourcegraph.test') || authStatus.endpoint?.includes('localhost')

    // TODO: Make this more robust
    const gatewayUrl = isLocalInstance ? 'http://localhost:9992' : 'https://cody-gateway.sourcegraph.com'

    const url = `${gatewayUrl}/v1/completions/unified`
    const log = logger?.startCompletion(requestParams, url)

    return tracer.startActiveSpan(
        `POST ${url}`,
        async function* (span): AsyncGenerator<CompletionGeneratorValue> {
            // Create a unified API request, cf sourcegraph/sourcegraph
            const request = {
                // TODO: This needs to be fixed in the upstream API
                model: requestParams.model?.replace(/^anthropic\//, ''),
                messages: requestParams.messages.map(message => {
                    return {
                        role: message.speaker === 'human' ? 'user' : message.speaker,
                        content: [{ type: 'text', text: message.text }],
                    }
                }),
                max_tokens: requestParams.maxTokensToSample,
                temperature: requestParams.temperature,
                top_p: requestParams.topP,
                top_k: requestParams.topK,
                stop_sequences: requestParams.stopSequences,
                stream: true,
            }

            const headers = new Headers()
            // Force HTTP connection reuse to reduce latency.
            // c.f. https://github.com/microsoft/vscode/issues/173861
            headers.set('Connection', 'keep-alive')
            headers.set('Content-Type', 'application/json; charset=utf-8')
            headers.set('Authorization', `Bearer ${fastPathAccessToken}`)
            headers.set('X-Sourcegraph-Feature', 'chat_completions')
            addTraceparent(headers)

            logDebug('FastPathChatClient', 'fetch', { verbose: { url, request } })
            const response = await fetch(url, {
                method: 'POST',
                body: JSON.stringify(request),
                headers,
                signal: abortSignal,
            })

            logResponseHeadersToSpan(span, response)

            const traceId = getActiveTraceAndSpanId()?.traceId

            // When rate-limiting occurs, the response is an error message The response here is almost
            // identical to the SG instance response but does not contain information on whether a user
            // is eligible to upgrade to the pro plan. We get this from the authState instead.
            if (response.status === 429) {
                const upgradeIsAvailable = authStatus.userCanUpgrade

                throw recordErrorToSpan(
                    span,
                    await createRateLimitErrorFromResponse(response, upgradeIsAvailable)
                )
            }

            if (!response.ok) {
                throw recordErrorToSpan(
                    span,
                    new NetworkError(
                        response,
                        (await response.text()) +
                            (isLocalInstance ? '\nIs Cody Gateway running locally?' : ''),
                        traceId
                    )
                )
            }

            if (response.body === null) {
                throw recordErrorToSpan(span, new TracedError('No response body', traceId))
            }

            const isStreamingResponse = response.headers
                .get('content-type')
                ?.startsWith('text/event-stream')
            if (!isStreamingResponse || !isNodeResponse(response)) {
                throw recordErrorToSpan(span, new TracedError('No streaming response given', traceId))
            }

            let fullResponse: CompletionResponse | undefined
            try {
                const iterator = createSSEIterator(response.body)
                for await (const { event, data } of iterator) {
                    if (event === 'error') {
                        throw new TracedError(data, traceId)
                    }

                    if (abortSignal?.aborted) {
                        if (fullResponse) {
                            fullResponse.stopReason = CompletionStopReason.RequestAborted
                        }
                        break
                    }

                    const response = JSON.parse(data) as UnifiedSSE

                    if (
                        response.type === 'ping' ||
                        response.type === 'message_start' ||
                        response.type === 'content_block_stop' ||
                        response.type === 'message_delta'
                    ) {
                        continue
                    }

                    if (response.type === 'message_stop') {
                        break
                    }

                    if (response.type === 'content_block_start') {
                        fullResponse = {
                            completion: response.content_block.text,
                            stopReason: CompletionStopReason.StreamingChunk,
                        }
                    } else {
                        fullResponse = {
                            completion:
                                (fullResponse ? fullResponse.completion : '') + response.delta.text,
                            stopReason: CompletionStopReason.StreamingChunk,
                        }
                    }

                    span.addEvent('yield', { stopReason: fullResponse.stopReason })
                    yield { type: 'change', text: fullResponse.completion }
                }

                if (fullResponse === undefined) {
                    throw new TracedError('No completion response received', traceId)
                }

                if (!fullResponse.stopReason) {
                    fullResponse.stopReason = CompletionStopReason.RequestFinished
                }

                return fullResponse
            } catch (error) {
                // In case of the abort error and non-empty completion response, we can
                // consider the completion partially completed and want to log it to
                // the Cody output channel via `log.onComplete()` instead of erroring.
                if (isAbortError(error as Error) && fullResponse) {
                    fullResponse.stopReason = CompletionStopReason.RequestAborted
                    return
                }

                recordErrorToSpan(span, error as Error)

                if (isRateLimitError(error as Error)) {
                    throw error
                }

                const message = `error parsing streaming CodeCompletionResponse: ${error}`
                log?.onError(message, error)
                throw new TracedError(message, traceId)
            } finally {
                if (fullResponse) {
                    span.addEvent('return', { stopReason: fullResponse.stopReason })
                    span.setStatus({ code: SpanStatusCode.OK })
                    span.end()
                    log?.onComplete(fullResponse)
                }
            }
        }
    )
}

async function createRateLimitErrorFromResponse(
    response: BrowserOrNodeResponse,
    upgradeIsAvailable: boolean
): Promise<RateLimitError> {
    const retryAfter = response.headers.get('retry-after')
    const limit = response.headers.get('x-ratelimit-limit')
    return new RateLimitError(
        'chat messages and commands',
        await response.text(),
        upgradeIsAvailable,
        limit ? parseInt(limit, 10) : undefined,
        retryAfter
    )
}

type UnifiedSSE =
    | { type: 'message_start' }
    | {
          type: 'content_block_start'
          content_block: {
              type: 'text'
              text: string
          }
      }
    | {
          type: 'ping'
      }
    | {
          type: 'content_block_delta'
          delta: {
              type: 'text_delta'
              text: string
          }
      }
    | {
          type: 'content_block_stop'
      }
    | {
          type: 'message_delta'
      }
    | {
          type: 'message_stop'
      }
