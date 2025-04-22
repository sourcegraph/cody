import { addAuthHeaders, currentResolvedConfig, getClientInfoParams } from '@sourcegraph/cody-shared'
import { type CloseEvent, type ErrorEvent, type MessageEvent, WebSocket } from 'ws'
import { forkSignal, generatorWithErrorObserver, generatorWithTimeout } from '../../completions/utils'
import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import {
    type AutoeditModelOptions,
    AutoeditStopReason,
    type AutoeditsModelAdapter,
    type ModelResponse,
    type ModelResponseShared,
    type SuccessModelResponse,
} from './base'
import type { FireworksResponse } from './model-response/fireworks'
import {
    type AutoeditsRequestBody,
    type FireworksCompatibleRequestParams,
    getMaxOutputTokensForAutoedits,
    getOpenaiCompatibleChatPrompt,
} from './utils'

const LOG_FILTER_LABEL = 'fireworks-websocket'
const SOCKET_RECONNECT_DELAY_MS = 5000

interface FireworksSSEBody {
    data: '[DONE]' | FireworksResponse
}

interface WebSocketMessage {
    body: FireworksSSEBody
    headers: Record<string, string>
}

interface MessageCallback {
    resolve: (message: WebSocketMessage) => void
    reject: (error: Error) => void
    signal: AbortSignal
}

// Auto-edit adaptor for Fireworks using websocket connection instead of HTTP
export class FireworksWebSocketAdapter implements AutoeditsModelAdapter {
    private readonly webSocketEndpoint: string
    private ws: WebSocket | undefined
    private messageId = 0
    private callbackQueue: Record<string, MessageCallback> = {}
    private pendingConnectPromise: Promise<WebSocket> | null = null

    constructor(webSocketEndpoint?: string) {
        if (!webSocketEndpoint) {
            autoeditsOutputChannelLogger.logError(LOG_FILTER_LABEL, 'webSocketEndpoint is not provided')
            throw new Error('No webSocketEndpoint provided')
        }
        this.webSocketEndpoint = webSocketEndpoint
    }

    dispose() {
        if (this.ws) {
            this.ws.close()
            this.ws = undefined
        }
        this.pendingConnectPromise = null
    }

    async getModelResponse(option: AutoeditModelOptions): Promise<AsyncGenerator<ModelResponse>> {
        const requestBody = this.getMessageBody(option)
        try {
            const apiKey = autoeditsProviderConfig.experimentalAutoeditsConfigOverride?.apiKey
            const abortController = forkSignal(option.abortSignal)
            return generatorWithErrorObserver(
                generatorWithTimeout(
                    this.createResponseHandler({
                        apiKey,
                        url: option.url,
                        body: requestBody,
                        abortSignal: option.abortSignal,
                        extractPrediction: response => {
                            if (option.isChatModel) {
                                return response.choices?.[0]?.message?.content ?? ''
                            }
                            return response.choices?.[0]?.text ?? ''
                        },
                    }),
                    option.timeoutMs,
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
            // TODO(CODY-5528): allow user to specify models
            // model: options.model,
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

    protected async *createResponseHandler({
        apiKey,
        url,
        body,
        abortSignal,
        extractPrediction,
        customHeaders = {},
    }: {
        apiKey?: string
        url: string
        body: ModelResponseShared['requestBody']
        abortSignal: AbortSignal
        extractPrediction: (body: FireworksResponse) => string
        customHeaders?: Record<string, string>
    }): AsyncGenerator<ModelResponse> {
        await this.connect()

        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            ...customHeaders,
        }

        // Use user provided (fireworks) apiKey. Otherwise, the websocket server will use its configured fireworks apiKey as fallback.
        if (apiKey) {
            requestHeaders.Authorization = `Bearer ${apiKey}`
        }

        const messageId = 'm_' + this.messageId++
        const messageQueue: (WebSocketMessage | Error)[] = []
        let queueResolver: (() => void) | null = null

        if (messageId in this.callbackQueue) {
            autoeditsOutputChannelLogger.logError(
                LOG_FILTER_LABEL,
                `unexpected, duplicate message ID ${messageId}`
            )
        }

        const pushToQueue = (message: WebSocketMessage | Error) => {
            messageQueue.push(message)
            queueResolver?.()
            queueResolver = null
        }

        this.callbackQueue[messageId] = {
            resolve: pushToQueue,
            reject: pushToQueue,
            signal: abortSignal,
        }

        const data = JSON.stringify({
            'x-message-id': messageId,
            'x-message-body': body,
            'x-message-url': url,
            'x-message-headers': requestHeaders,
        })

        if (abortSignal.aborted) {
            delete this.callbackQueue[messageId]
            throw new Error('abort signal received, message not sent')
        }

        // Initiate the request
        this.ws?.send(data)

        const state: Pick<SuccessModelResponse, 'responseBody' | 'prediction'> & { done: boolean } = {
            responseBody: {},
            prediction: '',
            done: false,
        }

        try {
            while (!abortSignal.aborted && !state.done) {
                if (messageQueue.length === 0) {
                    // If there is nothing in the queue, wait for the next message
                    await new Promise<void>(resolve => {
                        queueResolver = resolve
                    })
                }

                while (messageQueue.length > 0) {
                    const message = messageQueue.shift()!
                    if (message instanceof Error) {
                        throw message
                    }
                    yield this.processFireworksResponse(message, state, extractPrediction, {
                        requestHeaders,
                        requestUrl: url,
                        requestBody: body,
                    })
                }
            }
        } finally {
            delete this.callbackQueue[messageId]
        }
    }

    private processFireworksResponse(
        message: WebSocketMessage,
        state: Pick<SuccessModelResponse, 'responseBody' | 'prediction'> & { done: boolean },
        extractPrediction: (body: FireworksResponse) => string,
        requestParams: {
            requestHeaders: Record<string, string>
            requestUrl: string
            requestBody: ModelResponseShared['requestBody']
        }
    ): ModelResponse {
        if (!message.body) {
            throw new Error('Processing WebSocket response: no body')
        }
        state.responseBody = message.body

        if (state.responseBody.data === '[DONE]') {
            // Notify the message loop to stop
            state.done = true
            return {
                type: 'success',
                stopReason: AutoeditStopReason.RequestFinished,
                prediction: state.prediction,
                responseHeaders: message.headers,
                responseBody: state.responseBody,
                requestUrl: requestParams.requestUrl,
                requestHeaders: requestParams.requestHeaders,
                requestBody: requestParams.requestBody,
            }
        }

        try {
            const predictionChunk = extractPrediction(state.responseBody.data) || ''
            state.prediction += predictionChunk
            return {
                type: 'partial',
                stopReason: AutoeditStopReason.StreamingChunk,
                prediction: state.prediction,
                responseHeaders: requestParams.requestHeaders,
                responseBody: state.responseBody,
                requestUrl: requestParams.requestUrl,
                requestHeaders: requestParams.requestHeaders,
                requestBody: requestParams.requestBody,
            }
        } catch (parseError) {
            autoeditsOutputChannelLogger.logError(
                LOG_FILTER_LABEL,
                `Failed to parse stream data: ${parseError}`,
                { verbose: state.responseBody.data }
            )
            throw new Error(`Failed to parse stream data: ${parseError}`)
        }
    }

    private async connect(): Promise<WebSocket> {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return this.ws
        }

        if (this.pendingConnectPromise) {
            // Reuse the pending connection to avoid creating multiple connections
            return this.pendingConnectPromise
        }

        // Use sourcegraph authentication token
        const { auth } = await currentResolvedConfig()
        const clientInfoParams = getClientInfoParams()
        const query = new URLSearchParams(clientInfoParams)
        const url = new URL(`/.api/completions/code?${query.toString()}`, auth.serverEndpoint)
        const headers = new Headers({})
        await addAuthHeaders(auth, headers, url)

        const token = headers.get('Authorization')

        this.pendingConnectPromise = new Promise((resolve, reject) => {
            const protocol = `${clientInfoParams['client-name']}-${clientInfoParams['client-version']}`
            const ws = new WebSocket(this.webSocketEndpoint, protocol, {
                headers: {
                    authorization: token === null ? undefined : token,
                    'X-Sourcegraph-Endpoint': auth.serverEndpoint,
                },
            })
            ws.addEventListener('open', () => {
                autoeditsOutputChannelLogger.logDebug(
                    LOG_FILTER_LABEL,
                    `successfully connected to ${this.webSocketEndpoint}`
                )
                this.ws = ws
                this.pendingConnectPromise = null
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
                this.pendingConnectPromise = null
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
                this.pendingConnectPromise = null
                setTimeout(() => this.reconnect(), SOCKET_RECONNECT_DELAY_MS)
            })
            ws.addEventListener('message', (event: MessageEvent) => {
                const webSocketResponse = JSON.parse(event.data.toString())
                const messageId = webSocketResponse['x-message-id']
                if (!this.callbackQueue[messageId]) {
                    autoeditsOutputChannelLogger.logError(
                        LOG_FILTER_LABEL,
                        `unexpected, message ID ${messageId} not found in callback queue`
                    )
                    return
                }

                const { resolve: resolveFn, reject: rejectFn, signal } = this.callbackQueue[messageId]

                if (signal.aborted) {
                    delete this.callbackQueue[messageId]
                    rejectFn(new Error('abort signal received, message not handled'))
                    return
                }

                const body = webSocketResponse['x-message-body']
                const headers = webSocketResponse['x-message-headers']
                const status = webSocketResponse['x-message-status']

                if (status !== 200) {
                    autoeditsOutputChannelLogger.logError(
                        LOG_FILTER_LABEL,
                        `Error response from WebSocket: status ${status}`,
                        { verbose: body }
                    )
                    rejectFn(new Error(`WebSocket response error: ${status}`))
                } else {
                    resolveFn({ body, headers })
                }
            })
        })

        return this.pendingConnectPromise
    }

    private reconnect() {
        this.ws = undefined
        this.pendingConnectPromise = null
        this.pendingConnectPromise = this.connect()
    }
}
