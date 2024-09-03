import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { logDebug } from '@sourcegraph/cody-shared'
import open from 'open'
import { URI } from 'vscode-uri'

type CallbackHandler = (url: URI, token?: string) => void

const SIX_MINUTES = 6 * 60 * 1000

/**
 * Handles the authentication flow for Agent clients.
 * Manages the creation and lifecycle of an HTTP server to handle the token callback from the Sourcegraph login flow.
 * Redirects the user to the Sourcegraph instance login page and handles the token callback.
 */
export class AgentAuthHandler {
    private port = 0
    private server: Server | null = null
    private tokenCallbackHandlers: CallbackHandler[] = []

    public setTokenCallbackHandler(handler: CallbackHandler): void {
        this.tokenCallbackHandlers.push(handler)
    }

    public handleCallback(url: URI): void {
        try {
            const callbackUri = getValidCallbackUri(url.toString())
            if (!callbackUri) {
                throw new Error(url.toString() + ' is not a valid URL')
            }
            this.startServer(url.toString())
        } catch (error) {
            logDebug('AgentAuthHandler', `Invalid callback URL: ${error}`)
        }
    }

    private startServer(callbackUri: string): void {
        if (!this.tokenCallbackHandlers?.length) {
            logDebug('AgentAuthHandler', 'Token callback handler is not set.')
            return
        }

        if (this.server && this.port) {
            logDebug('AgentAuthHandler', 'Server already running')
            this.redirectToEndpointLoginPage(callbackUri)
            return
        }

        // Create an HTTP server to handle the token callback
        const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
            if (req.url?.startsWith('/api/sourcegraph/token')) {
                const url = new URL(req.url, `http://127.0.0.1:${this.port}`)
                const token = url.searchParams.get('token')
                if (token) {
                    for (const handler of this.tokenCallbackHandlers) {
                        handler(URI.parse(req.url), token)
                    }
                    res.writeHead(200, { 'Content-Type': 'text/html' })
                    // Close the window once the token is received.
                    res.end(`
                        <html>
                            <body>
                                Token received. This window will close automatically.
                                <script>
                                    window.close();
                                </script>
                            </body>
                        </html>
                    `)
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

        // Bind the server to the loopback interface
        server.listen(0, '127.0.0.1', () => {
            // The server is now bound to the loopback interface (127.0.0.1).
            // This ensures that only local processes can connect to it.
            this.port = (server.address() as AddressInfo).port
            this.server = server
            logDebug('AgentAuthHandler', `Server listening on port ${this.port}`)
            this.redirectToEndpointLoginPage(callbackUri)
            // Automatically close the server after 6 minutes,
            // as the startTokenReceiver in token-receiver.ts only listens for 5 minutes.
            setTimeout(() => this.closeServer(), SIX_MINUTES)
        })

        // Handle server errors
        server.on('error', error => {
            logDebug('AgentAuthHandler', `Server error: ${error}`)
        })
    }

    private closeServer(): void {
        if (this.server) {
            logDebug('AgentAuthHandler', 'Auth server closed')
            this.server.close()
        }
        this.server = null
        this.port = 0
    }

    /**
     * Redirects the user to the endpoint login page with the updated callback URI.
     *
     * The callback URI is updated by finding the 'requestFrom' parameter in the query string,
     * removing the old parameter, and adding a new parameter with the correct port number appended.
     *
     * @param callbackUri - The original callback URI to be updated.
     */
    private redirectToEndpointLoginPage(callbackUri: string): void {
        const uri = new URL(callbackUri)
        const params = new URLSearchParams(decodeURIComponent(uri.search))
        const requestFrom = params.get('requestFrom')
        if (requestFrom) {
            // Add the new parameter with the correct port number appended.
            const newRequestFrom = `${requestFrom}-${this.port}`
            params.set('requestFrom', newRequestFrom)
            const redirect = params.get('redirect')
            if (redirect) {
                params.set('redirect', redirect.replace(requestFrom, newRequestFrom))
            }
            uri.search = params.toString()
        }
        open(uri.toString())
    }

    public dispose(): void {
        this.closeServer()
    }
}

/**
 * Validates and normalizes a given callback URI.
 *
 * @param uri - The callback URI to validate and normalize.
 * @returns The validated and normalized URI, or `null` if the input URI is invalid.
 * @throws {Error} If the input URI is empty or starts with `file:`.
 */
function getValidCallbackUri(uri: string): URI | null {
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
