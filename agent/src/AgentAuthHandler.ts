import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { logDebug } from '@sourcegraph/cody-shared'
import open from 'open'
import { URI } from 'vscode-uri'

type CallbackHandler = (url: URI, token?: string) => void

const SIX_MINUTES = 6 * 60 * 1000

export class AgentAuthHandler {
    private port = 0
    private tokenCallbackHandlers: CallbackHandler[] = []
    private server: Server | null = null

    public setTokenCallbackHandler(handler: CallbackHandler): void {
        this.tokenCallbackHandlers.push(handler)
    }

    public handleCallback(url: URI): void {
        try {
            const formattedUri = isValidCallbackURI(url.toString())
            if (!formattedUri) {
                throw new Error(url.toString() + ' is not a valid URL')
            }
            this.startServer(formattedUri.toString())
        } catch (error) {
            logDebug('AgentAuthHandler', `Invalid callback URL: ${error}`)
        }
    }

    private startServer(callbackUri: string): void {
        if (!this.tokenCallbackHandlers?.length) {
            logDebug('AgentAuthHandler', 'Token callback handler is not set.')
            return
        }

        if (this.server) {
            logDebug('AgentAuthHandler', 'Server already running')
            this.redirectToEndpointLoginPage(callbackUri)
            return
        }

        const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
            if (req.url?.startsWith('/api/sourcegraph/token')) {
                const url = new URL(req.url)
                const token = url.searchParams.get('token')

                if (token) {
                    for (const handler of this.tokenCallbackHandlers) {
                        handler(URI.parse(req.url), token)
                    }
                    res.writeHead(200, { 'Content-Type': 'text/plain' })
                    res.end('Token received. You can now close this window.')
                    this.closeServer()
                } else {
                    res.writeHead(400, { 'Content-Type': 'text/plain' })
                    res.end('Token not found.')
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' })
                res.end('Not found')
            }
        })

        server.listen(0, '127.0.0.1', () => {
            this.port = (server.address() as AddressInfo).port
            logDebug('AgentAuthHandler', `Server listening on port ${this.port}`)
            this.server = server
            // Automatically close the server after 6 minutes,
            // as the startTokenReceiver in token-receiver.ts only listens for 5 minutes.
            setTimeout(() => this.closeServer(), SIX_MINUTES)
        })

        server.on('error', error => {
            logDebug('AgentAuthHandler', `Server error: ${error}`)
            this.closeServer()
        })

        this.redirectToEndpointLoginPage(callbackUri)
    }

    private closeServer(): void {
        if (this.server) {
            logDebug('AgentAuthHandler', 'Auth server closed')
            this.server.close()
            this.server = null
        }
    }

    private redirectToEndpointLoginPage(callbackUri: string): void {
        const updatedCallbackUri = new URL(callbackUri)
        const searchParams = updatedCallbackUri.searchParams

        // Find the key that starts with 'requestFrom'
        const requestFromKey = Array.from(searchParams.keys()).find(key => key.startsWith('requestFrom'))

        if (requestFromKey) {
            const [, currentRequestFrom] = requestFromKey.split('=')
            if (currentRequestFrom) {
                // Remove the old parameter.
                searchParams.delete(requestFromKey)
                // Add the new parameter with the correct port number appended.
                searchParams.set('requestFrom', `${currentRequestFrom}-${this.port}`)
                updatedCallbackUri.search = searchParams.toString()
            }
        }

        open(updatedCallbackUri.toString())
    }

    public dispose(): void {
        this.closeServer()
    }
}

function isValidCallbackURI(uri: string): URI | null {
    if (!uri || uri.startsWith('file:')) {
        throw new Error('Empty URL')
    }
    try {
        const endpointUri = new URL(uri)
        if (!endpointUri.protocol.startsWith('http')) {
            endpointUri.protocol = 'https:'
        }
        return URI.parse(endpointUri.href)
    } catch (error) {
        logDebug('Invalid URL: ', `${error}`)
        return null
    }
}
