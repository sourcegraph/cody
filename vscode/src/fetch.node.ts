import * as http from 'node:http'
import * as https from 'node:https'
// import http from 'node:http'
// import https from 'node:https'
// import { parse as parseUrl } from 'node:url'
import { agent, logDebug, logError } from '@sourcegraph/cody-shared'
// import type { AuthCredentials, ClientConfiguration, ClientState } from '@sourcegraph/cody-shared'
// import { HttpProxyAgent } from 'http-proxy-agent'
// import { HttpsProxyAgent } from 'https-proxy-agent'
// import { ProxyAgent } from 'proxy-agent'
// import { SocksProxyAgent } from 'socks-proxy-agent'
import type * as vscode from 'vscode'

import type { Agent } from 'agent-base'

// @ts-ignore
// import { registerLocalCertificates } from './certs'
// import { getConfiguration } from './configuration'

// import { validateProxySettings } from './configuration-proxy'

// The path to the exported class can be found in the npm contents
// https://www.npmjs.com/package/@vscode/proxy-agent?activeTab=code
const nodeModules = '_VSCODE_NODE_MODULES'
const proxyAgentPath = '@vscode/proxy-agent/out/agent'
const pacProxyAgent = 'PacProxyAgent'

/**
 * We use keepAlive agents here to avoid excessive SSL/TLS handshakes for autocomplete requests.
 */
// let httpAgent: http.Agent
// let httpsAgent: https.Agent
// let socksProxyAgent: SocksProxyAgent
// let httpProxyAgent: HttpProxyAgent<string>
// let httpsProxyAgent: HttpsProxyAgent<string>

// export function setCustomAgent(
//     configuration: ClientConfiguration
// ): ({ protocol }: Pick<URL, 'protocol'>) => http.Agent {
//     agent.current = getCustomAgent(configuration)
//     return agent.current as ({ protocol }: Pick<URL, 'protocol'>) => http.Agent
// }

export function initializeNetworkAgent(context: Pick<vscode.ExtensionContext, 'extensionUri'>): void {
    // This is to load certs for HTTPS requests
    /* TODO: Move to configuration proxy: registerLocalCertificates(context)
    httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 60000 })
    httpsAgent = new https.Agent({
        ...https.globalAgent.options,
        keepAlive: true,
        keepAliveMsecs: 60000,
    })


    const customAgent = setCustomAgent(
        validateProxySettings({
            configuration: getConfiguration(),
            auth: {} as AuthCredentials,
            clientState: {} as ClientState,
        })
    )
    */

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

    /**
 *
        const { secureEndpoint } = opts;

		// Calculate the `url` parameter
		const defaultPort = secureEndpoint ? 443 : 80;

 * 		const urlOpts = {
			...opts,
			protocol: secureEndpoint ? 'https:' : 'http:',
			pathname: path,
			search,

			// need to use `hostname` instead of `host` otherwise `port` is ignored
			hostname: opts.host,
			host: null,
			href: null,

			// set `port` to null when it is the protocol default port (80 / 443)
			port: defaultPort === opts.port ? null : opts.port
		};
		const url = format(urlOpts);

		debug('url: %o', url);
		let result = await this.resolver(req, opts, url);

 */

    try {
        const PacProxyAgent = (globalThis as any)?.[nodeModules]?.[proxyAgentPath]?.[
            pacProxyAgent
        ] /**?? customAgent**/
        //TODO: Logging!
        if (!PacProxyAgent) {
            logDebug('fetch.node', 'TODO: Not patching stufffs.')
            // WE don't handle this yet, we rely on the fact that Sourcegraph
            // HTTP Client and Completions client explicitly set agent.current
            // as their agent (which will be respected if PacProxy is not
            // interfering)
            return
        } // this actually in "VSCode 'Extension Host'"
        const originalConnect = PacProxyAgent.prototype.connect
        PacProxyAgent.prototype.connect = async function (
            req: http.ClientRequest,
            opts: http.RequestOptions
        ): Promise<any> {
            const agentBuilder =
                typeof opts.agent === 'function'
                    ? (opts.agent as Exclude<typeof agent.current, undefined>)
                    : null
            const reqAgent = agentBuilder
                ? agentBuilder(req, opts)
                : (opts.agent as http.Agent | undefined)

            if (!(agent._forceCodyProxy && reqAgent)) {
                opts.agent = reqAgent
                return originalConnect.apply(this, req, opts)
            }

            // this handles the case where the agent is not http.Agent but agent-base Agent
            // which has extra utility functions.
            try {
                const connect = (reqAgent as any).connect ?? (() => reqAgent)
                const socket = await connect()
                req.emit('proxy', { socket })
            } catch (err) {
                logError('fetch.node', 'error while handling PacProxy request')
                req.emit('proxy', { proxy, error: err })
            }
        }
    } catch {}
}
// if(!agent._forceCodyProxy){
//     // We've decided to, contrary to before, leave the original VSCode implmentation alone.
//     // Especially w.r.t. keep-alive which for reasons TODO: XXX
//     return
// }

// Overide PacProxyAgnent.connect()
// let s: Duplex | http.Agent;
// if (agent instanceof Agent) {
//     s = await agent.connect(req, opts);
// } else {
//     s = agent;
// }
// req.emit('proxy', { proxy, socket: s });
// return s;

// const originalConnect = PacProxyAgent.prototype.connect
// Patches the implementation defined here:
// https://github.com/microsoft/vscode-proxy-agent/blob/d340b9d34684da494d6ebde3bcd18490a8bbd071/src/agent.ts#L53
//             PacProxyAgent.prototype.connect = function (
//                 req: http.ClientRequest,
//                 opts: { protocol: string }
//             ): any {
//                 if (agent.current && agent._forceCodyProxy) {
//                     const originalResolver = this.resolver
//                     const originalAgent = this.opts.originalAgent
//                     const reset = () => {
//                         this.resolver = originalResolver
//                         this.originalAgent = originalAgent
//                     }

//                     this.resolver = () => null
//                     this.opts.originalAgent = agent.current
//                     return originalConnect.call(this, req, opts).finally(reset.bind(this))
//                 }
//                 return originalConnect.call(this, req, opts)

// try {
//     const connectionHeader = req.getHeader('connection')
//     if (
//         connectionHeader === 'keep-alive' ||
//         (Array.isArray(connectionHeader) && connectionHeader.includes('keep-alive'))
//     ) {
//         this.opts.originalAgent = customAgent(opts)
//         return originalConnect.call(this, req, opts)
//     }
//     return originalConnect.call(this, req, opts)
// } catch {
//     return originalConnect.call(this, req, opts)
// }

// Yoinked from https://github.com/microsoft/vscode-proxy-agent/blob/main/src/index.ts
function pacProxyIDFromURL(rawUrl: string | undefined) {
    const url = (rawUrl || '').trim()

    const [scheme, proxy] = url.split(/:\/\//, 1)
    if (!proxy) {
        return undefined
    }

    switch (scheme.toLowerCase()) {
        case 'http':
            return 'PROXY ' + proxy
        case 'https':
            return 'HTTPS ' + proxy
        case 'socks':
        case 'socks5':
        case 'socks5h':
            return 'SOCKS ' + proxy
        case 'socks4':
        case 'socks4a':
            return 'SOCKS4 ' + proxy
        default:
            return undefined
    }
}
