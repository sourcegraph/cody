import { Agent as HTTPAgent } from 'http'
import { Agent as HTTPSAgent } from 'https'

import { agent } from './fetch'

export function initializeNetworkAgent(): void {
    /**
     * We use keepAlive agents here to avoid excessive SSL/TLS handshakes for autocomplete requests.
     */
    const httpAgent = new HTTPAgent({ keepAlive: true })
    const httpsAgent = new HTTPSAgent({ keepAlive: true })

    agent.current = (parsedURL: URL): HTTPAgent => {
        if (parsedURL.protocol === 'http:') {
            return httpAgent
        }
        return httpsAgent
    }
}
