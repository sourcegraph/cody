import { type CloseEvent, type ErrorEvent, type MessageEvent, WebSocket } from 'ws'
import { forkSignal, generatorWithErrorObserver, generatorWithTimeout } from '../../completions/utils'
import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type {
    AutoeditModelOptions,
    AutoeditsModelAdapter,
    ModelResponse,
    ModelResponseShared,
} from './base'
import { type RawStreamEvent, processRawStreamEvents } from './process-raw-stream-events'
import {
    type AutoeditsRequestBody,
    type FireworksCompatibleRequestParams,
    getMaxOutputTokensForAutoedits,
    getOpenaiCompatibleChatPrompt,
} from './utils'

const LOG_FILTER_LABEL = 'fireworks-websocket'
const SOCKET_SEND_TIME_OUT_MS = 2000
const SOCKET_RECONNECT_DELAY_MS = 5000

interface MessageCallback {
    resolve: (response: Response) => void
    reject: (error: Error) => void
    signal: AbortSignal
}

// Auto-edit adaptor for Fireworks using websocket connection instead of HTTP
export class FireworksWebSocketAdapter implements AutoeditsModelAdapter {
    private readonly webSocketEndpoint: string
    private ws: WebSocket | undefined
    private messageId = 0
    private callbackQueue: Record<string, MessageCallback> = {}

    constructor() {
        const webSocketEndpoint =
            autoeditsProviderConfig.experimentalAutoeditsConfigOverride?.webSocketEndpoint
        if (!webSocketEndpoint) {
            autoeditsOutputChannelLogger.logError(LOG_FILTER_LABEL, 'webSocketEndpoint is not provided')
            throw new Error('No webSocketEndpoint provided')
        }
        this.webSocketEndpoint = webSocketEndpoint
    }

    dispose() {
        if (this.ws) {
            this.ws.close()
        }
    }

    async getModelResponse(option: AutoeditModelOptions): Promise<AsyncGenerator<ModelResponse>> {
        const requestBody = this.getMessageBody(option)
        try {
            const apiKey = autoeditsProviderConfig.experimentalAutoeditsConfigOverride?.apiKey

            if (!apiKey) {
                autoeditsOutputChannelLogger.logError(
                    'getModelResponse',
                    'No api key provided in the config override'
                )
                throw new Error('No api key provided in the config override')
            }

            const abortController = forkSignal(option.abortSignal)
            return generatorWithErrorObserver(
                generatorWithTimeout(
                    this.streamModelRequest({
                        apiKey,
                        url: option.url,
                        body: requestBody,
                        abortSignal: option.abortSignal,
                        extractPrediction: (response: any) => {
                            if (option.isChatModel) {
                                return response.choices?.[0]?.message?.content
                            }
                            return response.choices?.[0]?.text
                        },
                    }),
                    option.timeoutMs || 10000,
                    abortController
                ),
                error => {
                    autoeditsOutputChannelLogger.logError(
                        'getModelResponse',
                        'Error calling Fireworks WebSocket API:',
                        { verbose: error }
                    )
                    throw error
                }
            )
        } catch (error) {
            autoeditsOutputChannelLogger.logError(
                'getModelResponse',
                'Error calling Fireworks WebSocket API:',
                { verbose: error }
            )
            throw error
        }
    }

    private getMessageBody(options: AutoeditModelOptions): AutoeditsRequestBody {
        const maxTokens = getMaxOutputTokensForAutoedits(options.codeToRewrite)
        const baseParams: FireworksCompatibleRequestParams = {
            stream: true,
            model: options.model,
            temperature: 0.1,
            max_tokens: maxTokens,
            response_format: {
                type: 'text',
            },
            // Fireworks Predicted outputs
            // https://docs.fireworks.ai/guides/querying-text-models#predicted-outputs
            prediction: {
                type: 'content',
                content: options.codeToRewrite,
            },
            user: options.userId || undefined,
        }

        if (options.isChatModel) {
            return {
                ...baseParams,
                messages: getOpenaiCompatibleChatPrompt({
                    systemMessage: options.prompt.systemMessage,
                    userMessage: options.prompt.userMessage,
                }),
            }
        }

        return {
            ...baseParams,
            prompt: options.prompt.userMessage,
        }
    }

    protected async *streamModelRequest({
        apiKey,
        url,
        body,
        abortSignal,
        extractPrediction,
        customHeaders = {},
    }: {
        apiKey: string
        url: string
        body: ModelResponseShared['requestBody']
        abortSignal: AbortSignal
        extractPrediction: (body: any) => string
        customHeaders?: Record<string, string>
    }): AsyncGenerator<ModelResponse> {
        await this.connect()

        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...(body?.stream ? { 'Accept-Encoding': 'gzip;q=0' } : {}),
            ...customHeaders,
        }

        const streamSource = this.createWebSocketStreamSource(url, requestHeaders, body, abortSignal)
        yield* processRawStreamEvents(streamSource, {
            requestUrl: url,
            requestHeaders,
            abortSignal,
            extractPrediction,
        })
    }

    private async *createWebSocketStreamSource(
        url: string,
        headers: Record<string, string>,
        body: ModelResponseShared['requestBody'],
        signal: AbortSignal
    ): AsyncGenerator<RawStreamEvent> {
        const isStreamingEnabled = !!body?.stream
        const messageId = 'm_' + this.messageId++
        const state = { done: false, error: null as Error | null }
        const data = JSON.stringify({
            'x-message-id': messageId,
            'x-message-body': body,
            'x-message-url': url,
            'x-message-headers': headers,
            'x-message-stream': isStreamingEnabled,
        })

        if (messageId in this.callbackQueue) {
            autoeditsOutputChannelLogger.logError(
                LOG_FILTER_LABEL,
                `unexpected, duplicate message ID ${messageId}`
            )
        }

        const sendPromise: Promise<RawStreamEvent> = new Promise((resolve, reject) => {
            if (signal.aborted) {
                return reject(new Error('abort signal received, message not sent'))
            }
            this.callbackQueue[messageId] = {
                resolve: response => {
                    if (isStreamingEnabled) {
                        return this.handleStreamingResponse(response, state)
                    }
                    return this.handleNonStreamingResponse(response, state)
                },
                reject: error => {
                    state.error = error
                    return
                },
                signal,
            }
            this.ws?.send(data)
        })

        let timeoutHandle: NodeJS.Timeout
        const timeoutPromise: Promise<RawStreamEvent> = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
                delete this.callbackQueue[messageId]
                reject(new Error('timeout in sending message to fireworks'))
            }, SOCKET_SEND_TIME_OUT_MS)
        })

        try {
            while (!state.done && !signal.aborted) {
                if (state.error) {
                    throw state.error
                }
                const result = await Promise.race([sendPromise, timeoutPromise]).then(response => {
                    clearTimeout(timeoutHandle)
                    return response
                })
                if (result.event === 'done') {
                    break
                }
                yield result
            }

            if (!signal.aborted && !isStreamingEnabled) {
                // Explicitly our own 'done' event for non-streaming responses.
                // This just makes for better compatibility with `processRawStreamEvents` without
                // needing to rewrite a lot of code to support non-streaming responses.
                yield { event: 'done', data: '' }
            }
        } finally {
            delete this.callbackQueue[messageId]
        }
    }

    private handleNonStreamingResponse(
        response: any,
        state: { done: boolean; error: Error | null }
    ): RawStreamEvent {
        const responseBody = response['x-message-body']
        if (!responseBody) {
            state.error = new Error('No response body received')
            return { event: 'error', data: 'no response body' }
        }
        state.done = true
        return { event: 'data', data: responseBody }
    }

    private handleStreamingResponse(
        response: any,
        state: { done: boolean; error: Error | null }
    ): RawStreamEvent {
        const responseBody = response['x-message-body']?.data
        if (!responseBody) {
            state.error = new Error('No streaming response body received')
            return { event: 'error', data: 'no response body' }
        }

        if (responseBody === '[DONE]') {
            state.done = true
            return { event: 'done', data: '' }
        }

        return {
            event: 'data',
            data: responseBody,
        }
    }

    private async connect(): Promise<WebSocket> {
        return new Promise((resolve, reject) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                resolve(this.ws)
                return
            }

            const ws = new WebSocket(this.webSocketEndpoint)
            ws.addEventListener('open', () => {
                autoeditsOutputChannelLogger.logDebug(
                    LOG_FILTER_LABEL,
                    `successfully connected to ${this.webSocketEndpoint}`
                )
                this.ws = ws
                resolve(this.ws)
            })
            ws.addEventListener('error', (event: ErrorEvent) => {
                autoeditsOutputChannelLogger.logError(
                    LOG_FILTER_LABEL,
                    `error from ${this.webSocketEndpoint}: ${event.message}`
                )
                if (process.env.NODE_ENV === 'development') {
                    console.error(`error from ${this.webSocketEndpoint}: ${event.message}`)
                    console.error(event)
                }
                reject(event)
            })
            ws.addEventListener('close', (event: CloseEvent) => {
                autoeditsOutputChannelLogger.logDebug(
                    LOG_FILTER_LABEL,
                    `${this.webSocketEndpoint} connection closed with code ${event.code}`
                )
                if (process.env.NODE_ENV === 'development') {
                    console.error(`${this.webSocketEndpoint} connection closed`)
                    console.error(event)
                }
                setTimeout(() => this.reconnect(), SOCKET_RECONNECT_DELAY_MS)
            })
            ws.addEventListener('message', (event: MessageEvent) => {
                const webSocketResponse = JSON.parse(event.data.toString())
                const messageId = webSocketResponse['x-message-id']
                if (messageId in this.callbackQueue) {
                    const {
                        resolve: resolveFn,
                        reject: rejectFn,
                        signal,
                    } = this.callbackQueue[messageId]

                    if (signal.aborted) {
                        delete this.callbackQueue[messageId]
                        rejectFn(new Error('abort signal received, message not handled'))
                        return
                    }

                    const body = webSocketResponse['x-message-body']
                    const headers = webSocketResponse['x-message-headers']
                    const status = webSocketResponse['x-message-status']
                    const statusText = webSocketResponse['x-message-status-text']
                    if (status !== 200) {
                        resolveFn(new Response(body, { status, statusText, headers }))
                    } else {
                        resolveFn(
                            Response.json(body, {
                                status,
                                statusText,
                                headers,
                            })
                        )
                    }
                }
            })
        })
    }

    private reconnect() {
        ;(async () => {
            await this.connect()
        })()
    }
}
