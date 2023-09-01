import http from 'http'
import https from 'https'

import { agent } from './fetch'

const nodeModules = '_VSCODE_NODE_MODULES'
const proxyAgentPath = '@vscode/proxy-agent/out/agent'
const proxyAgent = 'PacProxyAgent'

export function initializeNetworkAgent(): void {
    /**
     * We use keepAlive agents here to avoid excessive SSL/TLS handshakes for autocomplete requests.
     */
    const httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 60000 })
    const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 60000 })

    const customAgent = ({ protocol }: Pick<URL, 'protocol'>): http.Agent => {
        if (protocol === 'http:') {
            return httpAgent
        }
        return httpsAgent
    }

    agent.current = customAgent

    /**
     * This works around an issue in the default VS Code proxy agent code. When `http.proxySupport`
     * is set to its default value and no proxy setting is being used, the proxy library does not
     * properly reuse the agent set on the http(s) method and is instead always using a new agent
     * per request.
     *
     * To work around this, we patch the default proxy agent method and overwrite the
     * `originalAgent` value before invoking it for requests that want to keep their connection
     * alive (as indicated by the `Connection: keep-alive` header).
     *
     * c.f. https://github.com/microsoft/vscode/issues/173861
     */
    try {
        const PacProxyAgent = (globalThis as any)?.[nodeModules]?.[proxyAgentPath]?.[proxyAgent] ?? undefined
        if (PacProxyAgent) {
            const originalConnect = PacProxyAgent.prototype.connect
            // Patches the implementation defined here:
            // https://github.com/microsoft/vscode-proxy-agent/blob/d340b9d34684da494d6ebde3bcd18490a8bbd071/src/agent.ts#L53
            PacProxyAgent.prototype.connect = function (req: http.ClientRequest, opts: { protocol: string }): any {
                try {
                    const connectionHeader = req.getHeader('connection')
                    if (
                        connectionHeader === 'keep-alive' ||
                        (Array.isArray(connectionHeader) && connectionHeader.includes('keep-alive'))
                    ) {
                        this.opts.originalAgent = customAgent(opts)
                        return originalConnect.call(this, req, opts)
                    }
                    return originalConnect.call(this, req, opts)
                } catch {
                    return originalConnect.call(this, req, opts)
                }
            }
        }
    } catch (error) {
        // Ignore any errors in the patching logic
        void error
    }
}
