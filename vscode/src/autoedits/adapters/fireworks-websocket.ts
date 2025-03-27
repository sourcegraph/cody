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

interface FireworksSSEBody {
    data:
        | '[DONE]'
        | {
              choices: [{ message: { content: string } }]
          }
}

interface MessageCallback {
    resolve: (body: FireworksSSEBody) => void
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
        const messageQueue: RawStreamEvent[] = []
        let queueResolver: (() => void) | null = null
        const state = { done: false }

        if (messageId in this.callbackQueue) {
            autoeditsOutputChannelLogger.logError(
                LOG_FILTER_LABEL,
                `unexpected, duplicate message ID ${messageId}`
            )
        }

        const pushEvent = (event: RawStreamEvent) => {
            messageQueue.push(event)
            // If we have a resolver, resolve it
            if (queueResolver) {
                queueResolver()
                queueResolver = null
            }
        }

        this.callbackQueue[messageId] = {
            resolve: (response: FireworksSSEBody) => {
                const streamEvent = isStreamingEnabled
                    ? this.handleStreamingResponse(response, state)
                    : this.handleNonStreamingResponse(response, state)
                pushEvent(streamEvent)
            },
            reject: (error: Error) => {
                pushEvent({ event: 'error', data: error.message })
            },
            signal,
        }

        const data = JSON.stringify({
            'x-message-id': messageId,
            'x-message-body': body,
            'x-message-url': url,
            'x-message-headers': headers,
            'x-message-stream': isStreamingEnabled,
        })
        this.ws?.send(data)

        try {
            while (!signal.aborted && !state.done) {
                // Wait until there's something in our queue.
                if (messageQueue.length === 0) {
                    await new Promise<void>(resolve => {
                        queueResolver = resolve
                    })
                }
                // Yield everything that's in the queue.
                while (messageQueue.length > 0) {
                    const event = messageQueue.shift()!
                    yield event
                    if (event.event === 'done') {
                        state.done = true
                        break
                    }
                }
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
        responseBody: FireworksSSEBody,
        state: { done: boolean }
    ): RawStreamEvent {
        if (!responseBody) {
            return { event: 'error', data: JSON.stringify({ error: 'no response body' }) }
        }

        const data = responseBody.data
        if (data === '[DONE]') {
            return { event: 'error', data: JSON.stringify({ error: 'unexpected response body' }) }
        }

        state.done = true
        return { event: 'data', data: JSON.stringify(data) }
    }

    private handleStreamingResponse(
        responseBody: FireworksSSEBody,
        state: { done: boolean }
    ): RawStreamEvent {
        if (!responseBody) {
            return { event: 'error', data: JSON.stringify({ error: 'no response body' }) }
        }

        const data = responseBody.data
        if (data === '[DONE]') {
            state.done = true
            return { event: 'done', data: '' }
        }

        return {
            event: 'data',
            data: JSON.stringify(data),
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
                    const status = webSocketResponse['x-message-status']
                    if (status !== 200) {
                        resolveFn(body)
                    } else {
                        resolveFn(body)
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
