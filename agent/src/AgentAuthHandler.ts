import { CodyIDE, logDebug } from '@sourcegraph/cody-shared'
import express from 'express'
import open from 'open'
import { URI } from 'vscode-uri'

export class AgentAuthHandler {
    private readonly port = 43452
    private readonly IDE: CodyIDE
    private endpointUri: URI | null = null
    private tokenCallbackHandler: ((url: URI) => void) | null = null
    private server: express.Application | null = null

    constructor(agentClientName: string) {
        this.IDE = agentClientName as CodyIDE
    }

    public setTokenCallbackHandler(handler: (url: URI) => void): void {
        this.tokenCallbackHandler = handler
    }

    private startServer(callbackUri: string): void {
        if (!this.tokenCallbackHandler) {
            logDebug('AgentAuthHandler', 'Token callback handler is not set.')
            return
        }

        this.server = express()

        // http://localhost:$PORT/api/sourcegraph/token?token=$TOKEN
        this.server.get('/api/sourcegraph/token', (req, res) => {
            const { token } = req.query
            if (typeof token === 'string') {
                this.tokenCallbackHandler?.(URI.parse(req.originalUrl))
                res.send('Token received. You can now close this window.')
                this.closeServer()
            } else {
                res.status(400).send('Token not found.')
            }
        })

        this.server.listen(this.port, () => {
            logDebug('AgentAuthHandler', `Server listening on port ${this.port}`)
            open(callbackUri)
            setTimeout(() => this.closeServer(), 3 * 60 * 1000)
        })

        this.server.on('error', error => {
            logDebug('AgentAuthHandler', `Server error: ${error}`)
            this.closeServer()
        })
    }

    private closeServer(): void {
        logDebug('AgentAuthHandler', 'Auth server closed')
        this.endpointUri = null
        process.exit(0)
    }

    public redirectToEndpointLoginPage(endpoint: string): void {
        const endpointUri = formatURL(endpoint)
        const referralCode = getCodyAuthReferralCode(this.IDE)
        if (!endpointUri || !referralCode) {
            throw new Error('Failed to construct callback URL')
        }
        this.endpointUri = endpointUri
        const callbackUri = new URL('/user/settings/tokens/new/callback', this.endpointUri.toString())
        callbackUri.searchParams.append(
            'requestFrom',
            `${getCodyAuthReferralCode(this.IDE)}-${this.port}`
        )
        this.startServer(callbackUri.toString())
    }

    public dispose(): void {
        this.closeServer()
    }
}

/**
 * Returns a known referral code to use based on the current VS Code environment.
 */
export function getCodyAuthReferralCode(ideName: CodyIDE, uriScheme?: string): string | undefined {
    const referralCodes: Record<CodyIDE, string> = {
        [CodyIDE.JetBrains]: 'CODY_JETBRAINS',
        [CodyIDE.Neovim]: 'CODY_NEOVIM',
        [CodyIDE.Emacs]: 'CODY_EMACS',
        [CodyIDE.VisualStudio]: 'VISUAL_STUDIO',
        [CodyIDE.Eclipse]: 'ECLIPSE',
        [CodyIDE.VSCode]: 'CODY',
        [CodyIDE.Web]: 'CODY',
    }

    if (ideName === CodyIDE.VSCode) {
        switch (uriScheme) {
            case 'vscode-insiders':
                return 'CODY_INSIDERS'
            case 'vscodium':
                return 'CODY_VSCODIUM'
            case 'cursor':
                return 'CODY_CURSOR'
        }
    }

    return referralCodes[ideName] || undefined
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
