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
            this.startServer(callbackUri.toString())
            // Redirect the user to the login page
            this.redirectToEndpointLoginPage(callbackUri.toString())
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

        // Create an HTTP server to handle the token callback
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

        // Bind the server to the loopback interface
        server.listen(0, '127.0.0.1', () => {
            // The server is now bound to the loopback interface (127.0.0.1)
            // This ensures that only local processes can connect to it
            this.port = (server.address() as AddressInfo).port
            this.server = server
            logDebug('AgentAuthHandler', `Server listening on port ${this.port}`)
            // Automatically close the server after 6 minutes,
            // as the startTokenReceiver in token-receiver.ts only listens for 5 minutes.
            setTimeout(() => this.closeServer(), SIX_MINUTES)
        })

        // Handle server errors
        server.on('error', error => {
            logDebug('AgentAuthHandler', `Server error: ${error}`)
            this.closeServer()
        })
    }

    private closeServer(): void {
        if (this.server) {
            logDebug('AgentAuthHandler', 'Auth server closed')
            this.server.close()
            this.server = null
        }
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
