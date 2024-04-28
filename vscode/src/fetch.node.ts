import  http from 'node:http'
import https from 'node:https'
import { parse as parseUrl } from 'url';
import { agent } from '@sourcegraph/cody-shared'
import { type Configuration } from '@sourcegraph/cody-shared'
import { getConfiguration } from './configuration'
import { ProxyAgent } from 'proxy-agent'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent';


// The path to the exported class can be found in the npm contents
// https://www.npmjs.com/package/@vscode/proxy-agent?activeTab=code
const nodeModules = '_VSCODE_NODE_MODULES'
const proxyAgentPath = '@vscode/proxy-agent/out/agent'
const pacProxyAgent = 'PacProxyAgent'

// let httpsAgent: https.Agent
/**
 * We use keepAlive agents here to avoid excessive SSL/TLS handshakes for autocomplete requests.
 */
let proxyAgent: ProxyAgent
let httpAgent: http.Agent
let httpsAgent: https.Agent
let socksProxyAgent: SocksProxyAgent
// WE should add back the Socks proxy agent logic from the before the
// chris's PR then this would all work properly - stephens recommednations

function getCustomAgent({ proxy }: Configuration): ({ protocol }: Pick<URL, 'protocol'>) => http.Agent {
    console.log("this is a car")
    return ({ protocol }) => {
        if (proxy?.startsWith('socks') && !socksProxyAgent) {
            socksProxyAgent = new SocksProxyAgent(proxy, {
                keepAlive: true,
                keepAliveMsecs: 60000,
            })
            return socksProxyAgent
        }
        if (proxy?.startsWith('socks')) {
            return socksProxyAgent
        }

        const optionProxyUrl = undefined
        const optionStrictSSL = undefined

        const proxyURL = optionProxyUrl || getSystemProxyURI(protocol, process.env);
        if (!proxyURL) {
            // return proxyAgent
            console.log("we found no proxies", protocol)
            if (protocol === 'http:') {
                return httpAgent
            }
            return httpsAgent
        }
        console.log("before proxy url", proxyURL)

        const proxyEndpoint = parseUrl(proxyURL);

        if (!/^https?:$/.test(proxyEndpoint.protocol || '')) {
            if (protocol === 'http:') {
                return httpAgent
            }
            return httpsAgent
        }

        const opts = {
            host: proxyEndpoint.hostname || '',
            port: (proxyEndpoint.port ? +proxyEndpoint.port : 0) || (proxyEndpoint.protocol === 'https' ? 443 : 80),
            auth: proxyEndpoint.auth,
            rejectUnauthorized: !!(optionStrictSSL) ? optionStrictSSL : true,
        };

        return protocol === 'http:'
            ? new HttpProxyAgent(proxyURL, opts)
            : new HttpsProxyAgent(proxyURL, opts);
    }
}

export function setCustomAgent(
    configuration: Configuration
): ({ protocol }: Pick<URL, 'protocol'>) => http.Agent {
    agent.current = getCustomAgent(configuration)
    return agent.current as ({ protocol }: Pick<URL, 'protocol'>) => http.Agent
}

function getSystemProxyURI( protocol: string, env: typeof process.env): string | null {
	if (protocol === 'http:') {
		return env.HTTP_PROXY || env.http_proxy || null;
	} else if (protocol === 'https:') {
		return env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || null;
	} else if (protocol === 'socks5:') {
        return env.SOCKS_PROXY || env.socks_proxy || null;
    }

	return null;
}

export function initializeNetworkAgent(): void {
    proxyAgent = new ProxyAgent({
        keepAlive: true,
        keepAliveMsecs: 60000,
        ...https.globalAgent.options,
    })
    httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 60000 })
    httpsAgent = new https.Agent({
        ...https.globalAgent.options,
        keepAlive: true,
        keepAliveMsecs: 60000,
    })
    console.log(httpAgent, httpsAgent)
    proxyAgent.keepAlive = true
    const customAgent = setCustomAgent(getConfiguration())

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
        const PacProxyAgent =
            (globalThis as any)?.[nodeModules]?.[proxyAgentPath]?.[pacProxyAgent] ?? undefined
        if (PacProxyAgent) {
            const originalConnect = PacProxyAgent.prototype.connect
            // Patches the implementation defined here:
            // https://github.com/microsoft/vscode-proxy-agent/blob/d340b9d34684da494d6ebde3bcd18490a8bbd071/src/agent.ts#L53
            PacProxyAgent.prototype.connect = function (
                req: http.ClientRequest,
                opts: { protocol: string }
            ): any {
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
