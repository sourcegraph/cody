import {
    type CodeCompletionsParams,
    type CompletionLogger,
    type CompletionResponse,
    type CompletionResponseGenerator,
    CompletionStopReason,
    type ExperimentalFireworksConfig,
    NetworkError,
    TracedError,
    addTraceparent,
    contextFiltersProvider,
    createSSEIterator,
    getActiveTraceAndSpanId,
    isAbortError,
    isNodeResponse,
    isRateLimitError,
    logResponseHeadersToSpan,
    recordErrorToSpan,
    tracer,
} from '@sourcegraph/cody-shared'
import { fetch } from '@sourcegraph/cody-shared'

import { SpanStatusCode } from '@opentelemetry/api'
import type { CompletionResponseWithMetaData } from '@sourcegraph/cody-shared/src/inferenceClient/misc'
import { logDebug } from '../log'
import { createRateLimitErrorFromResponse } from './default-client'
import type { FireworksOptions } from './providers/fireworks'
import type { ProviderOptions } from './providers/provider'

interface FastPathParams extends Pick<FireworksOptions, 'authStatus'> {
    isLocalInstance: boolean
    fireworksConfig: ExperimentalFireworksConfig | undefined
    logger: CompletionLogger | undefined
    providerOptions: ProviderOptions
    fastPathAccessToken: string | undefined
    customHeaders: Record<string, string>
    anonymousUserID: string | undefined
}

// When using the fast path, the Cody client talks directly to Cody Gateway. Since CG only
// proxies to the upstream API, we have to first convert the request to a Fireworks API
// compatible payload. We also have to manually convert SSE response chunks.
//
// Note: This client assumes that it is run inside a Node.js environment and will always use
// streaming to simplify the logic. Environments that do not support that should fall back to
// the default client.
export function createFastPathClient(
    requestParams: CodeCompletionsParams,
    abortController: AbortController,
    params: FastPathParams
): CompletionResponseGenerator {
    const {
        isLocalInstance,
        fireworksConfig,
        logger,
        providerOptions,
        anonymousUserID,
        authStatus,
        fastPathAccessToken,
        customHeaders,
    } = params

    const gatewayUrl = isLocalInstance ? 'http://localhost:9992' : 'https://cody-gateway.sourcegraph.com'
    const url = fireworksConfig ? fireworksConfig.url : `${gatewayUrl}/v1/completions/fireworks`
    const log = logger?.startCompletion(requestParams, url)

    return tracer.startActiveSpan(`POST ${url}`, async function* (span): CompletionResponseGenerator {
        if (abortController.signal.aborted) {
            // return empty completion response and skip the HTTP request
            return {
                completionResponse: {
                    completion: '',
                    stopReason: CompletionStopReason.RequestAborted,
                },
            }
        }

        // Convert the SG instance messages array back to the original prompt
        const prompt = await requestParams.messages[0]!.text!.toFilteredString(
            contextFiltersProvider.instance!
        )

        // c.f. https://readme.fireworks.ai/reference/createcompletion
        const fireworksRequest = {
            model: fireworksConfig?.model || requestParams.model?.replace(/^fireworks\//, ''),
            prompt,
            max_tokens: requestParams.maxTokensToSample,
            echo: false,
            temperature: fireworksConfig?.parameters?.temperature || requestParams.temperature,
            top_p: fireworksConfig?.parameters?.top_p || requestParams.topP,
            top_k: fireworksConfig?.parameters?.top_k || requestParams.topK,
            stop: [...(requestParams.stopSequences || []), ...(fireworksConfig?.parameters?.stop || [])],
            stream: true,
            languageId: providerOptions.document.languageId,
            user: anonymousUserID,
        }
        const headers = new Headers(customHeaders)
        // Force HTTP connection reuse to reduce latency.
        // c.f. https://github.com/microsoft/vscode/issues/173861
        headers.set('Connection', 'keep-alive')
        headers.set('Content-Type', `application/json${fireworksConfig ? '' : '; charset=utf-8'}`)
        headers.set('Authorization', `Bearer ${fastPathAccessToken}`)
        headers.set('X-Sourcegraph-Feature', 'code_completions')
        headers.set('X-Timeout-Ms', requestParams.timeoutMs.toString())
        addTraceparent(headers)

        logDebug('FireworksProvider', 'fetch', { verbose: { url, fireworksRequest } })
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(fireworksRequest),
            headers,
            signal: abortController.signal,
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

        const isStreamingResponse = response.headers.get('content-type')?.startsWith('text/event-stream')
        if (!isStreamingResponse || !isNodeResponse(response)) {
            throw recordErrorToSpan(span, new TracedError('No streaming response given', traceId))
        }

        const result: CompletionResponseWithMetaData = {
            completionResponse: undefined,
            metadata: { response },
        }

        // Convenience helper to make ternaries below more readable.
        function lastResponseField<T extends keyof CompletionResponse>(
            field: T
        ): CompletionResponse[T] | undefined {
            if (result.completionResponse) {
                return result.completionResponse[field]
            }
            return undefined
        }

        try {
            const iterator = createSSEIterator(response.body)
            let chunkIndex = 0

            for await (const { event, data } of iterator) {
                if (event === 'error') {
                    throw new TracedError(data, traceId)
                }

                if (abortController.signal.aborted) {
                    if (result.completionResponse && !result.completionResponse.stopReason) {
                        result.completionResponse.stopReason = CompletionStopReason.RequestAborted
                    }
                    break
                }

                // [DONE] is a special non-JSON message to indicate the end of the stream
                if (data === '[DONE]') {
                    break
                }

                const parsed = JSON.parse(data) as FireworksSSEData
                const choice = parsed.choices[0]

                if (!choice) {
                    continue
                }

                result.completionResponse = {
                    completion: (lastResponseField('completion') || '') + choice.text,
                    stopReason:
                        choice.finish_reason ??
                        (lastResponseField('stopReason') || CompletionStopReason.StreamingChunk),
                }

                span.addEvent('yield', {
                    charCount: result.completionResponse.completion.length,
                    stopReason: result.completionResponse.stopReason,
                })

                yield result

                chunkIndex += 1
            }

            if (result.completionResponse === undefined) {
                throw new TracedError('No completion response received', traceId)
            }

            if (!result.completionResponse.stopReason) {
                result.completionResponse.stopReason = CompletionStopReason.RequestFinished
            }

            return result
        } catch (error) {
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

            const message = `error parsing streaming CodeCompletionResponse: ${error}`
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
    })
}

interface FireworksSSEData {
    choices: [{ text: string; finish_reason: null }]
}
