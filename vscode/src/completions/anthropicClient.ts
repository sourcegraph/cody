import http from 'node:http'
import https from 'node:https'

import {
    type CompletionCallbacks,
    type CompletionParameters,
    type CompletionRequestParameters,
    type CompletionResponse,
    NeedsAuthChallengeError,
    NetworkError,
    RateLimitError,
    SourcegraphCompletionsClient,
    addAuthHeaders,
    addClientInfoParams,
    addCodyClientIdentificationHeaders,
    currentResolvedConfig,
    getActiveTraceAndSpanId,
    getAuthHeaders,
    getTraceparentHeaders,
    globalAgentRef,
    isCustomAuthChallengeResponse,
    logError,
    onAbort,
    recordErrorToSpan,
    toPartialUtf8String,
    tracer,
} from '@sourcegraph/cody-shared'

interface AnthropicClientOptions {
    apiKey: string
    apiEndpoint?: string
}

export class AnthropicCompletionsClient extends SourcegraphCompletionsClient {
    constructor(
        private options: AnthropicClientOptions,
        logger?: any
    ) {
        super(logger)
    }

    protected async completionsEndpoint(): Promise<string> {
        return this.options.apiEndpoint || 'http://localhost:8080/v1/messages:stream'
    }

    /**
     * Converts a Cody model identifier to an Anthropic model identifier
     *
     * Example: "anthropic::2024-10-22::claude-3-5-sonnet-latest" → "claude-3-5-sonnet-20240229"
     */
    private convertToAnthropicModelId(modelId?: string): string | undefined {
        if (!modelId) {
            return undefined
        }

        // Handle direct model IDs without prefixes
        if (!modelId.includes('::')) {
            return modelId
        }

        // Parse Cody's prefixed model identifier format: provider::version::model
        const parts = modelId.split('::')
        if (parts.length === 3 && parts[0].toLowerCase() === 'anthropic') {
            // Return just the model portion (the last part)
            return parts[2]
        }

        // If not an Anthropic model or format not recognized, return as is
        return modelId
    }

    protected async _streamWithCallbacks(
        params: CompletionParameters,
        requestParams: CompletionRequestParameters,
        cb: CompletionCallbacks,
        signal?: AbortSignal
    ): Promise<void> {
        const url = new URL(await this.completionsEndpoint())
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

            const log = this.logger?.startCompletion(params, url.toString())

            // Transform Sourcegraph completion params to Anthropic format
            const anthropicMessages = params.messages.map(msg => ({
                role:
                    msg.speaker === 'human'
                        ? 'user'
                        : msg.speaker === 'assistant'
                          ? 'assistant'
                          : 'system',
                content: msg.text?.toString() || '',
            }))

            // Extract the system prompt if it exists
            let systemPrompt = ''
            if (anthropicMessages.length > 0 && anthropicMessages[0].role === 'system') {
                systemPrompt = anthropicMessages[0].content
                anthropicMessages.shift()
            }

            const anthropicParams = {
                model: this.convertToAnthropicModelId(params.model) || 'claude-3-sonnet-20240229',
                messages: anthropicMessages,
                max_tokens: params.maxTokensToSample,
                temperature: params.temperature,
                top_k: params.topK,
                top_p: params.topP,
                stop_sequences: params.stopSequences,
                stream: true,
                system: systemPrompt,
            }

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

            const { auth, configuration } = await currentResolvedConfig()
            const headers = new Headers({
                'Content-Type': 'application/json',
                'X-API-Key': this.options.apiKey,
                'Anthropic-Version': '2023-06-01',
                'Anthropic-Beta': 'messages-2023-12-15',
                ...configuration?.customHeaders,
                ...requestParams.customHeaders,
                ...getTraceparentHeaders(),
                Connection: 'keep-alive',
            })
            addCodyClientIdentificationHeaders(headers)

            try {
                // HACK(beyang): getAuthHeaders checks for consistency between auth.serverEndpoint and url.host
                // but Anthropic's API endpoint is not consistent with the serverEndpoint
                await addAuthHeaders(auth, headers, new URL(auth.serverEndpoint))
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
                    function handleError(e: Error): void {
                        log?.onError(e.message, e)

                        if (statusCode === 429) {
                            const retryAfter = res.headers['retry-after']
                            const error = new RateLimitError(
                                'chat messages and commands',
                                e.message,
                                false,
                                undefined,
                                retryAfter
                            )
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
                        let bufferBin = Buffer.of()
                        // Text which has not been decoded as a server-sent event (SSE)
                        let errorMessage = ''
                        res.on('data', (chunk: Buffer) => {
                            if (!(chunk instanceof Buffer)) {
                                throw new TypeError('expected chunk to be a Buffer')
                            }
                            // Messages are expected to be UTF-8, but a chunk can terminate
                            // in the middle of a character
                            const result = toPartialUtf8String(Buffer.concat([bufferBin as any, chunk]))
                            errorMessage += result.str
                            bufferBin = result.buf
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
                    // For Anthropic's streaming response
                    let fullCompletion = ''

                    res.on('data', (chunk: Buffer) => {
                        if (!(chunk instanceof Buffer)) {
                            throw new TypeError('expected chunk to be a Buffer')
                        }
                        // text/event-stream messages are always UTF-8, but a chunk
                        // may terminate in the middle of a character
                        const result = toPartialUtf8String(Buffer.concat([bufferBin as any, chunk]))
                        bufferText += result.str
                        bufferBin = result.buf

                        // Process Anthropic SSE format
                        const lines = bufferText.split('\n')
                        bufferText = lines.pop() || ''

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6)
                                if (data === '[DONE]') {
                                    // End of stream
                                    didSendMessage = true
                                    didReceiveAnyEvent = true
                                    cb.onChange(fullCompletion)
                                    cb.onComplete()
                                    return
                                }

                                try {
                                    const event = JSON.parse(data)
                                    didSendMessage = true
                                    didReceiveAnyEvent = true

                                    if (
                                        event.type === 'content_block_delta' &&
                                        event.delta &&
                                        event.delta.text
                                    ) {
                                        fullCompletion += event.delta.text
                                        cb.onChange(fullCompletion)
                                    } else if (event.type === 'message_stop') {
                                        cb.onChange(fullCompletion)
                                        cb.onComplete()
                                    }
                                } catch (e) {
                                    // Skip invalid JSON
                                }
                            }
                        }
                    })
                    res.on('error', e => handleError(e))
                }
            )

            request.on('error', e => {
                let error = e
                if (error.message.includes('ECONNREFUSED')) {
                    error = new Error(
                        'Could not connect to Anthropic API. Please ensure that your API key is valid.'
                    )
                }
                log?.onError(error.message, e)
                onErrorOnce(error)
            })

            // If the connection is closed and we did neither receive an error HTTP code or any request body
            request.on('close', () => {
                const traceSpan = getActiveTraceAndSpanId()
                const traceInfo = traceSpan
                    ? { traceId: traceSpan.traceId, spanId: traceSpan.spanId }
                    : undefined
                if (!didReceiveAnyEvent) {
                    logError(
                        'AnthropicCompletionsClient',
                        "request.on('close')",
                        'Connection closed without receiving any events (this may be due to an outage with Anthropic)',
                        `trace-and-span: ${JSON.stringify(traceInfo)}`,
                        { verbose: { bufferText } }
                    )
                    onErrorOnce(
                        new Error(
                            `Connection closed without receiving any events (this may be due to an outage with Anthropic) ${JSON.stringify(
                                traceInfo
                            )}`
                        )
                    )
                }
                if (!didSendMessage) {
                    onErrorOnce(
                        new Error(`Connection unexpectedly closed: ${JSON.stringify(traceInfo)}`)
                    )
                }
            })

            request.write(JSON.stringify(anthropicParams))
            request.end()

            onAbort(signal, () => request.destroy())
        })
    }

    protected async _fetchWithCallbacks(
        params: CompletionParameters,
        _requestParams: CompletionRequestParameters,
        cb: CompletionCallbacks,
        signal?: AbortSignal
    ): Promise<void> {
        const url = new URL(await this.completionsEndpoint())
        addClientInfoParams(url.searchParams)

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
                // Transform Sourcegraph completion params to Anthropic format
                const anthropicMessages = params.messages.map(msg => ({
                    role:
                        msg.speaker === 'human'
                            ? 'user'
                            : msg.speaker === 'assistant'
                              ? 'assistant'
                              : 'system',
                    content: msg.text?.toString() || '',
                }))

                // Extract the system prompt if it exists
                let systemPrompt = ''
                if (anthropicMessages.length > 0 && anthropicMessages[0].role === 'system') {
                    systemPrompt = anthropicMessages[0].content
                    anthropicMessages.shift()
                }

                const anthropicParams = {
                    model: this.convertToAnthropicModelId(params.model) || 'claude-3-sonnet-20240229',
                    messages: anthropicMessages,
                    max_tokens: params.maxTokensToSample,
                    temperature: params.temperature,
                    top_k: params.topK,
                    top_p: params.topP,
                    stop_sequences: params.stopSequences,
                    stream: false,
                    system: systemPrompt,
                }

                const { auth, configuration } = await currentResolvedConfig()
                const headers = new Headers({
                    'Content-Type': 'application/json',
                    'X-API-Key': this.options.apiKey,
                    'Anthropic-Version': '2023-06-01',
                    'Anthropic-Beta': 'messages-2023-12-15',
                    ...configuration?.customHeaders,
                    ..._requestParams.customHeaders,
                    ...getTraceparentHeaders(),
                })

                addCodyClientIdentificationHeaders(headers)
                await addAuthHeaders(auth, headers, url)

                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers: Object.fromEntries(headers.entries()),
                    body: JSON.stringify(anthropicParams),
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

                const json = await response.json()
                if (json?.content && Array.isArray(json.content) && json.content.length > 0) {
                    const textContent = json.content.find(
                        (block: { type: string; text?: string }) => block.type === 'text'
                    )
                    if (textContent?.text) {
                        const completion: CompletionResponse = {
                            completion: textContent.text,
                        }
                        cb.onChange(completion.completion)
                        cb.onComplete()
                        return
                    }
                }
                throw new Error('Unexpected response format from Anthropic API')
            } catch (error) {
                const errorObject = error instanceof Error ? error : new Error(`${error}`)
                log?.onError(errorObject.message, error)
                recordErrorToSpan(span, errorObject)
                cb.onError(errorObject)
            }
        })
    }
}
