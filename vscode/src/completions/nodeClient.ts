// The node client can not live in lib/shared (with its browserClient
// counterpart) since it requires node-only APIs. These can't be part of
// the main `lib/shared` bundle since it would otherwise not work in the
// web build.
import http from 'node:http'
import https from 'node:https'

import {
    type CompletionCallbacks,
    type CompletionParameters,
    type CompletionRequestParameters,
    type CompletionResponse,
    FeatureFlag,
    NeedsAuthChallengeError,
    NetworkError,
    RateLimitError,
    SourcegraphCompletionsClient,
    addAuthHeaders,
    addClientInfoParams,
    addCodyClientIdentificationHeaders,
    currentResolvedConfig,
    featureFlagProvider,
    getActiveTraceAndSpanId,
    getSerializedParams,
    getTraceparentHeaders,
    globalAgentRef,
    handleRateLimitError,
    isCustomAuthChallengeResponse,
    isError,
    logError,
    onAbort,
    parseEvents,
    recordErrorToSpan,
    toPartialUtf8String,
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
        const { apiVersion, interactionId } = requestParams

        const url = new URL(await this.completionsEndpoint())
        url.searchParams.append('api-version', '' + apiVersion)
        addClientInfoParams(url.searchParams)

        return tracer.startActiveSpan(`POST ${url.toString()}`, async span => {
            span.setAttributes({
                fast: params.fast,
                maxTokensToSample: params.maxTokensToSample,
                temperature: params.temperature,
                topK: params.topK,
                topP: params.topP,
                model: params.model,
            })

            if (this.isTemperatureZero) {
                params = {
                    ...params,
                    temperature: 0,
                }
            }

            const serializedParams = await getSerializedParams(params)

            const log = this.logger?.startCompletion(params, url.toString())

            const requestFn = url.protocol === 'https:' ? https.request : http.request

            // Keep track if we have send any message to the completion callbacks
            let didSendMessage = false
            let didSendError = false
            let didReceiveAnyEvent = false

            // Call the error callback only once per request.
            const onErrorOnce = (error: Error, statusCode?: number | undefined): void => {
                if (!didSendError) {
                    recordErrorToSpan(span, error)
                    cb.onError(error, statusCode)
                    didSendMessage = true
                    didSendError = true
                }
            }

            // Text which has not been decoded as a server-sent event (SSE)
            let bufferText = ''

            const builder = new CompletionsResponseBuilder(apiVersion)

            const { auth, configuration } = await currentResolvedConfig()
            const headers = new Headers({
                'Content-Type': 'application/json',
                // Disable gzip compression since the sg instance will start to batch
                // responses afterwards.
                'Accept-Encoding': 'gzip;q=0',
                'X-Sourcegraph-Interaction-ID': interactionId || '',
                ...configuration?.customHeaders,
                ...requestParams.customHeaders,
                ...getTraceparentHeaders(),
                Connection: 'keep-alive',
            })
            addCodyClientIdentificationHeaders(headers)

            try {
                await addAuthHeaders(auth, headers, url)
            } catch (error: any) {
                log?.onError(error.message, error)
                onErrorOnce(error)
                return
            }

            const request = requestFn(
                url,
                {
                    method: 'POST',
                    headers: Object.fromEntries(headers.entries()),
                    // TODO: THIS MUST NOT BE DONE HERE!
                    // So we can send requests to the Sourcegraph local development instance, which has an incompatible cert.
                    // rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
                    agent: globalAgentRef.agent,
                },
                (res: http.IncomingMessage) => {
                    const { 'set-cookie': _setCookie, ...safeHeaders } = res.headers
                    span.addEvent('response', {
                        ...safeHeaders,
                        status: res.statusCode,
                    })

                    const statusCode = res.statusCode
                    if (statusCode === undefined) {
                        throw new Error('no status code present')
                    }

                    // Calls the error callback handler for an error.
                    //
                    // If the request failed with a rate limit error, wraps the
                    // error in RateLimitError.
                    async function handleError(e: Error): Promise<void> {
                        log?.onError(e.message, e)

                        if (statusCode === 429) {
                            // Check for explicit false, because if the header is not set, there
                            // is no upgrade available.
                            const upgradeIsAvailable =
                                typeof res.headers['x-is-cody-pro-user'] !== 'undefined' &&
                                res.headers['x-is-cody-pro-user'] === 'false'
                            const retryAfter = res.headers['retry-after']

                            const limit = res.headers['x-ratelimit-limit']
                                ? getHeader(res.headers['x-ratelimit-limit'])
                                : undefined

                            // Get feature flag value synchronously
                            const error = new RateLimitError(
                                'chat messages and commands',
                                e.message,
                                upgradeIsAvailable,
                                limit ? Number.parseInt(limit, 10) : undefined,
                                retryAfter
                            )

                            // Check feature flag and handle rate limit error if enabled
                            featureFlagProvider
                                .evaluatedFeatureFlag(FeatureFlag.FallbackToFlash)
                                .subscribe(fallbackToFlash => {
                                    if (fallbackToFlash) {
                                        handleRateLimitError(error)
                                    }
                                })

                            // Call error callback with rate limit error
                            onErrorOnce(error, statusCode)
                        } else {
                            onErrorOnce(e, statusCode)
                        }
                    }

                    // Handle custom auth challenges.
                    if (isCustomAuthChallengeResponse(res)) {
                        handleError(new NeedsAuthChallengeError())
                        return
                    }

                    if (statusCode >= 400) {
                        // For failed requests, we just want to read the entire body and
                        // ultimately return it to the error callback.
                        // Bytes which have not been decoded as UTF-8 text
                        let bufferBin: Buffer = Buffer.of()
                        // Text which has not been decoded as a server-sent event (SSE)
                        let errorMessage = ''
                        res.on('data', chunk => {
                            if (!(chunk instanceof Buffer)) {
                                throw new TypeError('expected chunk to be a Buffer')
                            }
                            // Messages are expected to be UTF-8, but a chunk can terminate
                            // in the middle of a character
                            const { str, buf } = toPartialUtf8String(
                                Buffer.concat([
                                    bufferBin as unknown as Uint8Array,
                                    chunk as unknown as Uint8Array,
                                ])
                            )
                            errorMessage += str
                            bufferBin = buf
                        })

                        res.on('error', e => handleError(e))
                        res.on('end', () =>
                            handleError(
                                new NetworkError(
                                    {
                                        url: url.toString(),
                                        status: statusCode,
                                        statusText: res.statusMessage ?? '',
                                    },
                                    errorMessage,
                                    getActiveTraceAndSpanId()?.traceId
                                )
                            )
                        )
                        return
                    }

                    // Bytes which have not been decoded as UTF-8 text
                    let bufferBin: Buffer = Buffer.of()

                    res.on('data', chunk => {
                        if (!(chunk instanceof Buffer)) {
                            throw new TypeError('expected chunk to be a Buffer')
                        }
                        // text/event-stream messages are always UTF-8, but a chunk
                        // may terminate in the middle of a character
                        const { str, buf } = toPartialUtf8String(
                            Buffer.concat([
                                bufferBin as unknown as Uint8Array,
                                chunk as unknown as Uint8Array,
                            ])
                        )
                        bufferText += str
                        bufferBin = buf

                        const parseResult = parseEvents(builder, bufferText)
                        if (isError(parseResult)) {
                            logError(
                                'SourcegraphNodeCompletionsClient',
                                'isError(parseEvents(bufferText))',
                                parseResult
                            )
                            return
                        }

                        didSendMessage = true
                        didReceiveAnyEvent = didReceiveAnyEvent || parseResult.events.length > 0
                        log?.onEvents(parseResult.events)

                        // Ensure we have usage data for the completion request
                        if (parseResult.events.length > 0) {
                            this.sendEvents(parseResult.events, cb, span)
                        } else {
                            // Log a warning but don't fail the request if no events were detected
                            logError(
                                'SourcegraphNodeCompletionsClient',
                                'No events detected in parseResult',
                                { verbose: { bufferText } }
                            )
                        }

                        bufferText = parseResult.remainingBuffer
                    })
                    res.on('error', e => handleError(e))
                }
            )

            request.on('error', e => {
                let error = e
                if (error.message.includes('ECONNREFUSED')) {
                    error = new Error(
                        'Could not connect to Cody. Please ensure that you are connected to the Sourcegraph server.'
                    )
                }
                log?.onError(error.message, e)
                onErrorOnce(error)
            })

            // If the connection is closed and we did neither:
            //
            // - Receive an error HTTP code
            // - Or any request body
            //
            // We still want to close the request.
            request.on('close', () => {
                const traceSpan = getActiveTraceAndSpanId()
                const traceInfo = traceSpan
                    ? { traceId: traceSpan.traceId, spanId: traceSpan.spanId }
                    : undefined
                if (!didReceiveAnyEvent) {
                    const errorMsg =
                        'Connection closed without receiving any events (this may be due to an outage with the upstream LLM provider)'
                    logError(
                        'SourcegraphNodeCompletionsClient',
                        "request.on('close')",
                        errorMsg,
                        `trace-and-span: ${JSON.stringify(traceInfo)}`,
                        { verbose: { bufferText } }
                    )
                    onErrorOnce(new Error(`${errorMsg} ${JSON.stringify(traceInfo)}`))
                } else if (!didSendMessage) {
                    // We received events but didn't send any messages to the callback
                    logError(
                        'SourcegraphNodeCompletionsClient',
                        "request.on('close')",
                        'Received events but did not send any messages to callback',
                        `trace-and-span: ${JSON.stringify(traceInfo)}`,
                        { verbose: { bufferText } }
                    )
                    onErrorOnce(
                        new Error(`Connection unexpectedly closed: ${JSON.stringify(traceInfo)}`)
                    )
                }
            })

            request.write(JSON.stringify(serializedParams))
            request.end()

            onAbort(signal, () => request.destroy())
        })
    }

    protected async _fetchWithCallbacks(
        params: CompletionParameters,
        requestParams: CompletionRequestParameters,
        cb: CompletionCallbacks,
        signal?: AbortSignal
    ): Promise<void> {
        const { url, serializedParams, headerParams } = await this.prepareRequest(params, requestParams)
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
                    ...configuration.customHeaders,
                    ...requestParams.customHeaders,
                    ...getTraceparentHeaders(),
                    ...headerParams,
                })

                addCodyClientIdentificationHeaders(headers)
                await addAuthHeaders(auth, headers, url)

                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers: Object.fromEntries(headers.entries()),
                    body: JSON.stringify(serializedParams),
                    signal,
                })
                featureFlagProvider
                    .evaluatedFeatureFlag(FeatureFlag.FallbackToFlash)
                    .subscribe(async (fallbackToFlash: boolean) => {
                        if (fallbackToFlash) {
                            if (response.status === 429) {
                                const upgradeIsAvailable =
                                    response.headers.get('x-is-cody-pro-user') === 'false' &&
                                    typeof response.headers.get('x-is-cody-pro-user') !== 'undefined'
                                const retryAfter = response.headers.get('retry-after')
                                const limit = response.headers.get('x-ratelimit-limit')
                                const error = new RateLimitError(
                                    'chat messages and commands',
                                    await response.text(),
                                    upgradeIsAvailable,
                                    limit ? Number.parseInt(limit, 10) : undefined,
                                    retryAfter
                                )
                                handleRateLimitError(error)
                                throw error
                            }
                        }
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

function getHeader(value: string | undefined | string[]): string | undefined {
    if (Array.isArray(value)) {
        return value[0]
    }
    return value
}
