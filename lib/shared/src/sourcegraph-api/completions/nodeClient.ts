import http from 'http'
import https from 'https'

import { onAbort } from '../../common/abortController'
import { logDebug, logError } from '../../logger'
import { isError } from '../../utils'
import { RateLimitError } from '../errors'
import { customUserAgent } from '../graphql/client'
import { toPartialUtf8String } from '../utils'

import { CompletionStopReason } from '../../inferenceClient/misc'
import { OLLAMA_DEFAULT_URL, type OllamaGenerateResponse } from '../../ollama/ollama-client'
import { getTraceparentHeaders, recordErrorToSpan, tracer } from '../../tracing'
import { SourcegraphCompletionsClient } from './client'
import { parseEvents } from './parse'
import type { CompletionCallbacks, CompletionParameters, CompletionResponse } from './types'

const isTemperatureZero = process.env.CODY_TEMPERATURE_ZERO === 'true'

export class SourcegraphNodeCompletionsClient extends SourcegraphCompletionsClient {
    protected _streamWithCallbacks(
        params: CompletionParameters,
        cb: CompletionCallbacks,
        signal?: AbortSignal
    ): void {
        tracer.startActiveSpan(`POST ${this.completionsEndpoint}`, span => {
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

            const log = this.logger?.startCompletion(params, this.completionsEndpoint)

            // TODO (bee) clean up & move to seperate function
            if (params.model?.startsWith('ollama')) {
                const lastHumanMessage = params.messages[params.messages.length - 2]
                const stopReason = ''
                const ollamaparams = {
                    ...params,
                    stop_sequence: [stopReason],
                    model: params.model.replace('ollama/', ''),
                    prompt: lastHumanMessage.text,
                    messages: params.messages.map(msg => {
                        return {
                            role: msg.speaker === 'human' ? 'user' : 'assistant',
                            content: msg.text,
                        }
                    }),
                }

                fetch(new URL('/api/generate', OLLAMA_DEFAULT_URL).href, {
                    method: 'POST',
                    body: JSON.stringify(ollamaparams),
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    signal,
                }).then(async response => {
                    const reader = response?.body?.getReader() // Get the reader from the ReadableStream

                    const textDecoderStream = new TransformStream({
                        transform(chunk, controller) {
                            const text = new TextDecoder().decode(chunk, { stream: true })
                            controller.enqueue(text)
                        },
                    })

                    const readableStream = new ReadableStream({
                        start(controller) {
                            const pump = () => {
                                reader?.read().then(({ done, value }) => {
                                    if (done) {
                                        controller.close()
                                        return
                                    }
                                    controller.enqueue(value)
                                    pump()
                                })
                            }
                            pump()
                        },
                    })

                    const transformedStream = readableStream.pipeThrough(textDecoderStream)
                    const readerForTransformedStream = transformedStream.getReader()

                    let insertText = ''

                    while (true) {
                        const { done, value } = await readerForTransformedStream.read()
                        if (done) {
                            break
                        }
                        const lines = value.toString().split(/\r?\n/).filter(Boolean)
                        for (const line of lines) {
                            if (!line) {
                                continue
                            }
                            const parsedLine = JSON.parse(line) as OllamaGenerateResponse

                            if (parsedLine.response) {
                                insertText += parsedLine.response
                                cb.onChange(insertText)
                            }

                            if (parsedLine.done && parsedLine.total_duration) {
                                logDebug?.('ollama', 'generation done', parsedLine)
                                const completionResponse: CompletionResponse = {
                                    completion: insertText,
                                    stopReason: stopReason || CompletionStopReason.RequestFinished,
                                }
                                cb.onComplete()
                                log?.onComplete(completionResponse)
                            }
                        }
                    }

                    const completionResponse: CompletionResponse = {
                        completion: insertText,
                        stopReason: stopReason || CompletionStopReason.RequestFinished,
                    }
                    log?.onComplete(completionResponse)
                })
                return
            }

            const requestFn = this.completionsEndpoint.startsWith('https://')
                ? https.request
                : http.request

            // Keep track if we have send any message to the completion callbacks
            let didSendMessage = false
            let didSendError = false

            // Call the error callback only once per request.
            const onErrorOnce = (error: Error, statusCode?: number | undefined): void => {
                if (!didSendError) {
                    recordErrorToSpan(span, error)
                    cb.onError(error, statusCode)
                    didSendMessage = true
                    didSendError = true
                }
            }

            const request = requestFn(
                this.completionsEndpoint,
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
                        ...getTraceparentHeaders(),
                    },
                    // So we can send requests to the Sourcegraph local development instance, which has an incompatible cert.
                    rejectUnauthorized:
                        process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' && !this.config.debugEnable,
                },
                (res: http.IncomingMessage) => {
                    const { 'set-cookie': _setCookie, ...safeHeaders } = res.headers
                    span.addEvent('response', {
                        ...safeHeaders,
                        status: res.statusCode,
                    })

                    if (res.statusCode === undefined) {
                        throw new Error('no status code present')
                    }

                    // Calls the error callback handler for an error.
                    //
                    // If the request failed with a rate limit error, wraps the
                    // error in RateLimitError.
                    function handleError(e: Error): void {
                        log?.onError(e.message, e)

                        if (res.statusCode === 429) {
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
                                limit ? parseInt(limit, 10) : undefined,
                                retryAfter
                            )
                            onErrorOnce(error, res.statusCode)
                        } else {
                            onErrorOnce(e, res.statusCode)
                        }
                    }

                    // For failed requests, we just want to read the entire body and
                    // ultimately return it to the error callback.
                    if (res.statusCode >= 400) {
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
                        res.on('end', () => handleError(new Error(errorMessage)))
                        return
                    }

                    // By tes which have not been decoded as UTF-8 text
                    let bufferBin = Buffer.of()
                    // Text which has not been decoded as a server-sent event (SSE)
                    let bufferText = ''

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
                if (!didSendMessage) {
                    onErrorOnce(new Error('Connection unexpectedly closed'))
                }
            })

            request.write(JSON.stringify(params))
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
