import { isAbortError } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { type CloseEvent, type ErrorEvent, type MessageEvent, WebSocket } from 'ws'
import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { AbortedModelResponse, ModelResponseShared, SuccessModelResponse } from './base'
import { FireworksAdapter } from './fireworks'

const LOG_FILTER_LABEL = 'fireworks-websocket'
const SOCKET_SEND_TIME_OUT_MS = 2000
const SOCKET_RECONNECT_DELAY_MS = 5000

interface MessageCallback {
    resolve: (response: Response) => void
    reject: (reason?: any) => void
    signal: AbortSignal
}

// Auto-edit adaptor for Fireworks using websocket connection instead of HTTP
export class FireworksWebSocketAdapter extends FireworksAdapter implements vscode.Disposable {
    private readonly webSocketEndpoint: string
    private ws: WebSocket | undefined
    private messageId = 0
    private callbackQueue: Record<string, MessageCallback> = {}

    constructor() {
        super()
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

    protected async sendModelRequest({
        apiKey,
        url,
        body,
        abortSignal,
        customHeaders = {},
    }: {
        apiKey: string
        url: string
        body: ModelResponseShared['requestBody']
        abortSignal: AbortSignal
        customHeaders?: Record<string, string>
    }): Promise<Omit<SuccessModelResponse, 'prediction'> | AbortedModelResponse> {
        await this.connect()

        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        }

        const partialResult = {
            requestHeaders,
            requestUrl: url,
            requestBody: body,
        }

        try {
            const response = await this.sendMessage(url, requestHeaders, body, abortSignal)

            if (response.status !== 200) {
                const errorText = await response.text()
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`)
            }

            // Extract headers into a plain object
            const responseHeaders: Record<string, string> = {}
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value
            })

            const responseBody = await response.json()
            return { ...partialResult, type: 'success', responseBody, responseHeaders }
        } catch (error) {
            if (isAbortError(error)) {
                return { ...partialResult, type: 'aborted' }
            }

            // Propagate error the auto-edit provider
            throw error
        }
    }

    private async sendMessage(
        url: string,
        headers: Record<string, string>,
        body: ModelResponseShared['requestBody'],
        signal: AbortSignal
    ): Promise<Response> {
        const messageId = 'm_' + this.messageId++
        const data = JSON.stringify({
            'x-message-id': messageId,
            'x-message-body': body,
            'x-message-url': url,
            'x-message-headers': headers,
        })

        if (messageId in this.callbackQueue) {
            autoeditsOutputChannelLogger.logError(
                LOG_FILTER_LABEL,
                `unexpected, duplicate message ID ${messageId}`
            )
        }

        const sendPromise: Promise<Response> = new Promise((resolve, reject) => {
            if (!signal.aborted) {
                this.callbackQueue[messageId] = {
                    resolve,
                    reject,
                    signal,
                }
                this.ws?.send(data)
            } else {
                reject(new Error('abort signal received, message not sent'))
            }
        })

        let timeoutHandle: NodeJS.Timeout
        const timeoutPromise: Promise<Response> = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
                delete this.callbackQueue[messageId]
                reject(new Error('timeout in sending message to fireworks'))
            }, SOCKET_SEND_TIME_OUT_MS)
        })

        return Promise.race([sendPromise, timeoutPromise]).then(response => {
            clearTimeout(timeoutHandle)
            return response
        })
    }

    private reconnect() {
        ;(async () => {
            await this.connect()
        })()
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
                resolve(this.ws!)
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
                setTimeout(this.reconnect, SOCKET_RECONNECT_DELAY_MS)
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
                    } else {
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
                        delete this.callbackQueue[messageId]
                    }
                }
            })
        })
    }
}
