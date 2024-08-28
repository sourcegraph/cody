import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import http from 'node:http'
import { type CodyIDE, getCodyAuthReferralCode, logDebug } from '@sourcegraph/cody-shared'
import open from 'open'
import { URI } from 'vscode-uri'

type CallbackHandler = (url: URI, token?: string) => void

export class AgentAuthHandler {
    private readonly port = 43452
    private readonly IDE: CodyIDE
    private endpointUri: URI | null = null
    private tokenCallbackHandlers: CallbackHandler[] = []
    private server: Server | null = null

    constructor(agentClientName: string) {
        this.IDE = agentClientName as CodyIDE
    }

    public setTokenCallbackHandler(handler: CallbackHandler): void {
        this.tokenCallbackHandlers.push(handler)
    }

    private startServer(callbackUri: string): void {
        if (!this.tokenCallbackHandlers?.length) {
            logDebug('AgentAuthHandler', 'Token callback handler is not set.')
            return
        }

        this.server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
            if (req.url?.startsWith('/api/sourcegraph/token')) {
                const url = new URL(req.url, `http://localhost:${this.port}`)
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

        open(callbackUri)

        this.server.listen(this.port, () => {
            logDebug('AgentAuthHandler', `Server listening on port ${this.port}`)
            setTimeout(() => this.closeServer(), 3 * 60 * 1000)
        })

        this.server.on('error', error => {
            logDebug('AgentAuthHandler', `Server error: ${error}`)
            this.closeServer()
        })
    }

    private closeServer(): void {
        if (this.server) {
            logDebug('AgentAuthHandler', 'Auth server closed')
            this.server.close()
        }
        this.endpointUri = null
    }

    public handleCallback(url: URI): void {
        this.startServer(url.toString())
    }

    public redirectToEndpointLoginPage(endpoint: string): void {
        const endpointUri = formatURL(endpoint)
        const referralCode = getCodyAuthReferralCode(this.IDE)
        if (!endpointUri || !referralCode) {
            throw new Error('Failed to construct callback URL')
        }
        this.endpointUri = endpointUri
        const callbackUri = new URL('/user/settings/tokens/new/callback', this.endpointUri.toString())
        callbackUri.searchParams.append('requestFrom', `${referralCode}-${this.port}`)
        this.startServer(callbackUri.toString())
    }

    public dispose(): void {
        this.closeServer()
    }
}

export function formatURL(uri: string): URI | null {
    if (!uri.length) {
        return null
    }
    try {
        const endpointUri = new URL(uri.startsWith('http') ? uri : `https://${uri}`)
        return URI.parse(endpointUri.href)
    } catch (error) {
        logDebug('Invalid URL: ', `${error}`)
        return null
    }
}
