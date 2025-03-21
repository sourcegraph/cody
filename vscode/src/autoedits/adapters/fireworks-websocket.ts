import { isAbortError } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { type CloseEvent, type ErrorEvent, type Event, type MessageEvent, WebSocket } from 'ws'
import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { AbortedModelResponse, ModelResponseShared, SuccessModelResponse } from './base'
import { FireworksAdapter } from './fireworks'

const LOG_FILTER_LABEL = 'fireworks-websocket'

// Auto-edit adaptor for fireworking using websocket connection instead of HTTP
export class FireworksWebSocketAdapter extends FireworksAdapter implements vscode.Disposable {
    private readonly webSocketEndpoint: string
    private ws: WebSocket | undefined
    private messageId = 0

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
        const ws = await this.connect()

        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        }
        const partialResult = {
            requestHeaders,
            requestUrl: url,
            requestBody: body,
        }

        const messageId = 'm_' + this.messageId++
        const data = JSON.stringify({
            'x-message-id': messageId,
            'x-message-body': JSON.stringify(body),
            'x-message-url': url,
            'x-message-headers': JSON.stringify(requestHeaders),
        })

        try {
            const response = await new Promise((resolve: (response: Response) => void) => {
                const messageCallback = (event: MessageEvent) => {
                    const webSocketResponse = JSON.parse(event.data as string)
                    if (webSocketResponse['x-message-id'] === messageId) {
                        const body = webSocketResponse['x-message-body']
                        resolve(
                            new Response(body, {
                                headers: JSON.parse(webSocketResponse['x-message-headers']),
                            })
                        )
                        ws.removeEventListener('message', messageCallback)
                    }
                }
                ws.addEventListener('message', messageCallback)
                ws.send(data)
            })

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

    private async connect(): Promise<WebSocket> {
        return new Promise((resolve, reject) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                resolve(this.ws)
                return
            }
            this.ws = new WebSocket(this.webSocketEndpoint)
            this.ws.addEventListener('open', (event: Event) => {
                autoeditsOutputChannelLogger.logDebug(
                    LOG_FILTER_LABEL,
                    `successfully connected to ${this.webSocketEndpoint}: ${event}`
                )
                resolve(this.ws!)
            })
            this.ws.addEventListener('error', (event: ErrorEvent) => {
                autoeditsOutputChannelLogger.logError(
                    LOG_FILTER_LABEL,
                    `error from ${this.webSocketEndpoint}: ${event}`
                )
                console.error(`error from ${this.webSocketEndpoint}: ${event}`)
                reject(event)
            })
            this.ws.addEventListener('close', (event: CloseEvent) => {
                autoeditsOutputChannelLogger.logDebug(
                    LOG_FILTER_LABEL,
                    `${this.webSocketEndpoint} connection closed, ${event}`
                )
            })
        })
    }
}
