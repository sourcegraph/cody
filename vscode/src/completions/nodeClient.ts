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
    NetworkError,
    RateLimitError,
    SourcegraphCompletionsClient,
    addClientInfoParams,
    agent,
    customUserAgent,
    getActiveTraceAndSpanId,
    getSerializedParams,
    getTraceparentHeaders,
    isError,
    logError,
    onAbort,
    parseEvents,
    recordErrorToSpan,
    toPartialUtf8String,
    tracer,
} from '@sourcegraph/cody-shared'

const isTemperatureZero = process.env.CODY_TEMPERATURE_ZERO === 'true'

export class SourcegraphNodeCompletionsClient extends SourcegraphCompletionsClient {
    protected _streamWithCallbacks(
        params: CompletionParameters,
        requestParams: CompletionRequestParameters,
        cb: CompletionCallbacks,
        signal?: AbortSignal
    ): Promise<void> {
        const { apiVersion } = requestParams

        const url = new URL(this.completionsEndpoint)
        if (apiVersion >= 1) {
            url.searchParams.append('api-version', '' + apiVersion)
        }
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

            if (isTemperatureZero) {
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

            const request = requestFn(
                url,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        // Disable gzip compression since the sg instance will start to batch
                        // responses afterwards.
                        'Accept-Encoding': 'gzip;q=0',
                        ...(this.config.accessToken
                            ? { Authorization: `token ${this.config.accessToken}` }
                            : null),
                        ...(customUserAgent ? { 'User-Agent': customUserAgent } : null),
                        ...this.config.customHeaders,
                        ...requestParams.customHeaders,
                        ...getTraceparentHeaders(),
                        Connection: 'keep-alive',
                    },
                    // So we can send requests to the Sourcegraph local development instance, which has an incompatible cert.
                    rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
                    agent: agent.current?.(url),
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
                    function handleError(e: Error): void {
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

                            const error = new RateLimitError(
                                'chat messages and commands',
                                e.message,
                                upgradeIsAvailable,
                                limit ? Number.parseInt(limit, 10) : undefined,
                                retryAfter
                            )
                            onErrorOnce(error, statusCode)
                        } else {
                            onErrorOnce(e, statusCode)
                        }
                    }

                    // For failed requests, we just want to read the entire body and
                    // ultimately return it to the error callback.
                    if (statusCode >= 400) {
                        // Bytes which have not been decoded as UTF-8 text
                        let bufferBin = Buffer.of()
                        // Text which has not been decoded as a server-sent event (SSE)
                        let errorMessage = ''
                        res.on('data', chunk => {
                            if (!(chunk instanceof Buffer)) {
                                throw new TypeError('expected chunk to be a Buffer')
                            }
                            // Messages are expected to be UTF-8, but a chunk can terminate
                            // in the middle of a character
                            const { str, buf } = toPartialUtf8String(Buffer.concat([bufferBin, chunk]))
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
                    let bufferBin = Buffer.of()

                    res.on('data', chunk => {
                        if (!(chunk instanceof Buffer)) {
                            throw new TypeError('expected chunk to be a Buffer')
                        }
                        // text/event-stream messages are always UTF-8, but a chunk
                        // may terminate in the middle of a character
                        const { str, buf } = toPartialUtf8String(Buffer.concat([bufferBin, chunk]))
                        bufferText += str
                        bufferBin = buf

                        const parseResult = parseEvents(bufferText)
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
                        this.sendEvents(parseResult.events, cb, span)
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
                if (!didReceiveAnyEvent) {
                    logError(
                        'SourcegraphNodeCompletionsClient',
                        "request.on('close')",
                        'Connection closed without receiving any events',
                        { verbose: { bufferText } }
                    )
                    onErrorOnce(new Error('Connection closed without receiving any events'))
                }
                if (!didSendMessage) {
                    onErrorOnce(new Error('Connection unexpectedly closed'))
                }
            })

            request.write(JSON.stringify(serializedParams))
            request.end()

            onAbort(signal, () => request.destroy())
        })
    }
}

function getHeader(value: string | undefined | string[]): string | undefined {
    if (Array.isArray(value)) {
        return value[0]
    }
    return value
}
