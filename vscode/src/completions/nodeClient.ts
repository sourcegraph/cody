// The node client can not live in lib/shared (with its browserClient
// counterpart) since it requires node-only APIs. These can't be part of
// the main `lib/shared` bundle since it would otherwise not work in the
// web build.

import {
    type CompletionCallbacks,
    type CompletionParameters,
    type CompletionRequestParameters,
    type CompletionResponse,
    NetworkError,
    RateLimitError,
    SourcegraphCompletionsClient,
    addCodyClientIdentificationHeaders,
    currentResolvedConfig,
    fetch,
    getActiveTraceAndSpanId,
    getTraceparentHeaders,
    isError,
    parseEvents,
    recordErrorToSpan,
    tracer,
} from '@sourcegraph/cody-shared'
import { CompletionsResponseBuilder } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/CompletionsResponseBuilder'

export class SourcegraphNodeCompletionsClient extends SourcegraphCompletionsClient {
    protected async _streamWithCallbacks(
        params: CompletionParameters,
        requestParams: CompletionRequestParameters,
        cb: CompletionCallbacks,
        signal?: AbortSignal
    ): Promise<void> {
        const { url, serializedParams } = await this.prepareRequest(params, requestParams)
        const log = this.logger?.startCompletion(params, url.toString())

        return tracer.startActiveSpan(`POST ${url.toString()}`, async span => {
            span.setAttributes({
                fast: params.fast,
                maxTokensToSample: params.maxTokensToSample,
                temperature: this.isTemperatureZero ? 0 : params.temperature,
                topK: params.topK,
                topP: params.topP,
                model: params.model,
            })

            const { auth, configuration } = await currentResolvedConfig()
            const headers = new Headers({
                'Content-Type': 'application/json',
                'Accept-Encoding': 'gzip;q=0',
                ...(auth.accessToken ? { Authorization: `token ${auth.accessToken}` } : null),
                ...configuration.customHeaders,
                ...requestParams.customHeaders,
                ...getTraceparentHeaders(),
                Connection: 'keep-alive',
            })
            addCodyClientIdentificationHeaders(headers)

            try {
                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers: Object.fromEntries(headers.entries()),
                    body: JSON.stringify(serializedParams),
                    signal,
                })

                if (!response.ok) {
                    const errorMessage = await response.text()
                    if (response.status === 429) {
                        const upgradeIsAvailable = response.headers.get('x-is-cody-pro-user') === 'false'
                        const retryAfter = response.headers.get('retry-after')
                        const limit = response.headers.get('x-ratelimit-limit')

                        throw new RateLimitError(
                            'chat messages and commands',
                            errorMessage,
                            upgradeIsAvailable,
                            limit ? Number.parseInt(limit, 10) : undefined,
                            retryAfter || undefined
                        )
                    }
                    throw new NetworkError(
                        {
                            url: url.toString(),
                            status: response.status,
                            statusText: response.statusText,
                        },
                        errorMessage,
                        getActiveTraceAndSpanId()?.traceId
                    )
                }

                const textStream = response.body?.pipeThrough(new TextDecoderStream())
                const reader = textStream?.getReader()
                try {
                    if (!reader) {
                        throw new Error('No response body reader available')
                    }

                    let bufferText = ''
                    let didReceiveAnyEvent = false
                    const builder = new CompletionsResponseBuilder(requestParams.apiVersion)

                    while (true) {
                        const { done, value } = await reader.read()
                        if (done) break

                        bufferText += value

                        const parseResult = parseEvents(builder, bufferText)
                        if (isError(parseResult)) {
                            throw parseResult
                        }

                        didReceiveAnyEvent = didReceiveAnyEvent || parseResult.events.length > 0
                        log?.onEvents(parseResult.events)
                        this.sendEvents(parseResult.events, cb, span)
                        bufferText = parseResult.remainingBuffer
                    }

                    if (!didReceiveAnyEvent) {
                        throw new Error(
                            'Connection closed without receiving any events (this may be due to an outage with the upstream LLM provider)'
                        )
                    }
                } finally {
                    reader?.releaseLock()
                }
            } catch (error) {
                const errorObject = error instanceof Error ? error : new Error(`${error}`)
                log?.onError(errorObject.message, error)
                recordErrorToSpan(span, errorObject)
                cb.onError(errorObject)
            }
        })
    }

    protected async _fetchWithCallbacks(
        params: CompletionParameters,
        requestParams: CompletionRequestParameters,
        cb: CompletionCallbacks,
        signal?: AbortSignal
    ): Promise<void> {
        const { url, serializedParams } = await this.prepareRequest(params, requestParams)
        const log = this.logger?.startCompletion(params, url.toString())
        return tracer.startActiveSpan(`POST ${url.toString()}`, async span => {
            span.setAttributes({
                fast: params.fast,
                maxTokensToSample: params.maxTokensToSample,
                temperature: this.isTemperatureZero ? 0 : params.temperature,
                topK: params.topK,
                topP: params.topP,
                model: params.model,
            })
            try {
                const { auth, configuration } = await currentResolvedConfig()
                const headers = new Headers({
                    'Content-Type': 'application/json',
                    'Accept-Encoding': 'gzip;q=0',
                    ...(auth.accessToken ? { Authorization: `token ${auth.accessToken}` } : null),
                    ...configuration.customHeaders,
                    ...requestParams.customHeaders,
                    ...getTraceparentHeaders(),
                })

                addCodyClientIdentificationHeaders(headers)

                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers: Object.fromEntries(headers.entries()),
                    body: JSON.stringify(serializedParams),
                    signal,
                })
                if (!response.ok) {
                    const errorMessage = await response.text()
                    throw new NetworkError(
                        {
                            url: url.toString(),
                            status: response.status,
                            statusText: response.statusText,
                        },
                        errorMessage,
                        getActiveTraceAndSpanId()?.traceId
                    )
                }
                const json = (await response.json()) as CompletionResponse
                if (typeof json?.completion === 'string') {
                    cb.onChange(json.completion)
                    cb.onComplete()
                    return
                }
                throw new Error('Unexpected response format')
            } catch (error) {
                const errorObject = error instanceof Error ? error : new Error(`${error}`)
                log?.onError(errorObject.message, error)
                recordErrorToSpan(span, errorObject)
                cb.onError(errorObject)
            }
        })
    }
}
