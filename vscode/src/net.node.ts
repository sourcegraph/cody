import * as fs from 'node:fs'
import type { Agent, ClientRequest } from 'node:http'
import * as http from 'node:http'
import https from 'node:https'
import * as os from 'node:os'
import * as path from 'node:path'
import type stream from 'node:stream'
// import http from 'node:http'
// import https from 'node:https'
// import { parse as parseUrl } from 'node:url'
import type { ClientConfiguration } from '@sourcegraph/cody-shared'
import {
    distinctUntilChanged,
    firstValueFrom,
    globalAgentRef,
    logDebug,
    logError,
    mapError,
    resolvedConfig,
    shareReplay,
    startWith,
    subscriptionDisposable,
} from '@sourcegraph/cody-shared'
import { Agent as AgentBase, type AgentConnectOpts } from 'agent-base'
// import { HttpProxyAgent } from 'http-proxy-agent'
// import { HttpsProxyAgent } from 'https-proxy-agent'
// import { SocksProxyAgent } from 'socks-proxy-agent'
import { type Observable, map } from 'observable-fns'
// import type { AuthCredentials, ClientConfiguration, ClientState } from '@sourcegraph/cody-shared'
// import { HttpProxyAgent } from 'http-proxy-agent'
// import { HttpsProxyAgent } from 'https-proxy-agent'
// import { ProxyAgent } from 'proxy-agent'
// import { SocksProxyAgent } from 'socks-proxy-agent'
import type * as vscode from 'vscode'
import { getConfiguration } from './configuration'
// import { ProxyAgent } from 'proxy-agent'
import { CONFIG_KEY } from './configuration-keys'

export class DelegatingProxyAgent extends AgentBase implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private cachedAgents = new Map<string, Agent | undefined>()

    private constructor() {
        super()
        this.disposables.push(
            subscriptionDisposable(this.config.subscribe(this.handleConfigChanges.bind(this)))
        )
    }

    dispose() {
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
    }

    private config = resolvedConfig
        .pipe(
            // This ensures we can "boot" before config is resolved.
            startWith({
                configuration: getConfiguration(),
            }),
            map(v => {
                const { proxy, proxyServer, proxyPath, proxyCACert } = v.configuration
                return { proxy, proxyServer, proxyPath, proxyCACert }
            }),
            distinctUntilChanged()
        )
        //Note: This is split into two pipes because observable-fns sadly hasn't
        //used recursive types properly so after 7 elements the typing breaks.
        .pipe(
            map(normalizeSettings),
            distinctUntilChanged(),
            map(resolveSettings),
            mapError((error: Error) => {
                return {
                    error,
                    bypassVSCode: false,
                    caCert: null,
                    path: null,
                    server: null,
                    vscodeServer: null,
                }
            })
        )
        .pipe(distinctUntilChanged(), shareReplay())

    private handleConfigChanges(v: ResolvedSettings) {
        // we don't rely on useLatestValue on the observable because it adds a bit of overhead on each connect call
        // We also already construct a new agent for all of those perviously constructed
        this.cachedAgents.clear()
    }

    static async initialize() {
        if (globalAgentRef.isSet) {
            throw new Error('Already initialized')
        }
        const agent = new DelegatingProxyAgent()
        await firstValueFrom(agent.config)
        globalAgentRef.curr = agent
        return agent
    }

    async connect(
        req: ClientRequest,
        options: AgentConnectOpts & { prevAgent?: AgentBase }
    ): Promise<stream.Duplex | Agent> {
        if (options.prevAgent) {
            return options.prevAgent.connect(req, options)
        }

        return options.secureEndpoint ? https.globalAgent : https.globalAgent
    }
}

export async function intializeConfigurationProxy(
    config: Observable<Pick<ClientConfiguration, 'proxy' | 'proxyServer' | 'proxyPath' | 'proxyCACert'>>
) {
    // 1. Attempt to load initial proxy settings / ca certs etc
    //    1.1 set up config change listener to update agent = {current, _forceCodyProxy}
    // 2. regardless of success resolve promise
}

//@ts-ignore
function getGlobalProxyURI(protocol: string, env: typeof process.env): string | null {
    if (protocol === 'http:') {
        return env.HTTP_PROXY || env.http_proxy || null
    }
    if (protocol === 'https:') {
        return env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || null
    }
    if (protocol.startsWith('socks')) {
        return env.SOCKS_PROXY || env.socks_proxy || null
    }
    return null
}

// function getAgentFactory({
//     proxy,
//     proxyServer,
//     proxyPath,
//     proxyCACert,
// }: ClientConfiguration): ({ protocol }: Pick<URL, 'protocol'>) => any {
//     return ({ protocol }) => {
//         if (proxyServer || proxyPath) {
//             const [proxyHost, proxyPort] = proxyServer ? proxyServer.split(':') : [undefined, undefined]

//             // Combine the CA certs from the global options with the one(s) defined in settings,
//             // otherwise the CA cert in the settings overrides all of the global agent options
//             // (or the other way around, depending on the order of the options).
//             const caCerts = (() => {
//                 if (proxyCACert) {
//                     if (Array.isArray(https.globalAgent.options.ca)) {
//                         return [...https.globalAgent.options.ca, proxyCACert]
//                     }
//                     return [https.globalAgent.options.ca, proxyCACert]
//                 }
//                 return undefined
//             })()
//             const agent = new ProxyAgent({
//                 protocol: protocol || 'https:',
//                 ...(proxyServer ? { host: proxyHost, port: Number(proxyPort) } : null),
//                 ...(proxyPath ? { socketPath: proxyPath } : null),
//                 keepAlive: true,
//                 keepAliveMsecs: 60000,
//                 ...https.globalAgent.options,
//                 // Being at the end, this will override https.globalAgent.options.ca
//                 ...(caCerts ? { ca: caCerts } : null),
//             })
//             return agent
//         }

//         const proxyURL = proxy || getGlobalProxyURI(protocol, process.env)
//         if (proxyURL) {
//             if (proxyURL?.startsWith('socks')) {
//                 if (!socksProxyAgent) {
//                     socksProxyAgent = new SocksProxyAgent(proxyURL, {
//                         keepAlive: true,
//                         keepAliveMsecs: 60000,
//                     })
//                 }
//                 return socksProxyAgent
//             }
//             const proxyEndpoint = parseUrl(proxyURL)

//             const opts = {
//                 host: proxyEndpoint.hostname || '',
//                 port:
//                     (proxyEndpoint.port ? +proxyEndpoint.port : 0) ||
//                     (proxyEndpoint.protocol === 'https' ? 443 : 80),
//                 auth: proxyEndpoint.auth,
//                 rejectUnauthorized: true,
//                 keepAlive: true,
//                 keepAliveMsecs: 60000,
//                 ...https.globalAgent.options,
//             }
//             if (protocol === 'http:') {
//                 if (!httpProxyAgent) {
//                     httpProxyAgent = new HttpProxyAgent(proxyURL, opts)
//                 }
//                 return httpProxyAgent
//             }

//             if (!httpsProxyAgent) {
//                 httpsProxyAgent = new HttpsProxyAgent(proxyURL, opts)
//             }
//             return httpsProxyAgent
//         }
//         return protocol === 'http:' ? httpAgent : httpsAgent
//     }
// }

// subscribe to proxy settings changes in order to validate them and refresh the agent if needed
// export const proxySettings: Observable<ClientConfiguration> = resolvedConfig.pipe(
//     // pluck(resolvedConfig, [CONFIG_KEY.proxy, CONFIG_KEY.proxyServer, CONFIG_KEY.proxyPath, CONFIG_KEY.proxyCACert]),
//     map(validateProxySettings),
//     distinctUntilChanged((prev, curr) => {
//         return (
//             prev.proxy === curr.proxy &&
//             prev.proxyServer === curr.proxyServer &&
//             prev.proxyPath === curr.proxyPath &&
//             prev.proxyCACert === curr.proxyCACert
//         )
//     })
// )

// set up the subscription here instead of in main.ts => start() because adding it to main.ts
// introduced fetch.node.ts as a dependency, which pulled in transitive dependencies that are not
// available for browser builds, which breaks the "_build:esbuild:web" target.
// We handled a similar issue with the Search extension by using package resolution in a build script,
// but there's no build script here and `esbuild --alias` doesn't like `./` prefixes, so it can't map
// `./fetch.node` to a stub/shim module.
// proxySettings.subscribe(setCustomAgent)

// let cachedProxyPath: string | undefined
// let cachedProxyCACertPath: string | null | undefined
// let cachedProxyCACert: string | undefined

function normalizeSettings(raw: {
    proxy: string | null | undefined
    proxyServer: string | null | undefined
    proxyPath: string | null | undefined
    proxyCACert: string | null | undefined
}) {
    const caCertConfig = isInlineCert(raw.proxyCACert)
        ? { proxyCACert: raw.proxyCACert, proxyCACertPath: null }
        : { proxyCACert: null, proxyCACertPath: normalizePath(raw.proxyCACert) }

    return {
        ...raw,
        ...caCertConfig,
        proxyPath: normalizePath(raw.proxyPath),
    }
}

type ResolvedSettings = {
    error: Error | null
    server: string | null
    path: string | null
    caCert: string | null
    vscodeServer: string | null
    bypassVSCode: boolean
}

function resolveSettings(settings: {
    proxy: string | null | undefined
    proxyServer: string | null | undefined
    proxyPath: string | null | undefined
    proxyCACert: string | null | undefined
    proxyCACertPath: string | null | undefined
}): ResolvedSettings {
    const path = resolveProxyPath(settings.proxyPath) || null
    const caCert = settings.proxyCACert || readProxyCACert(settings.proxyCACertPath) || null
    return {
        bypassVSCode: !!settings.proxyServer || !!settings.proxyPath || false,
        error: null,
        vscodeServer: settings.proxy || null,
        server: settings.proxyServer || null,
        path,
        caCert,
    }
}

// function validateProxySettings(config: ResolvedConfiguration): ClientConfiguration {
//     const resolvedProxyPath = normalizePath(config.configuration.proxyPath)
//     const resolvedProxyCACert = normalizePath(config.configuration.proxyCACert)
//     if (resolvedProxyPath !== cachedProxyPath) {
//         cachedProxyPath = validateProxyPath(resolvedProxyPath)
//     }
//     if (resolvedProxyCACert !== cachedProxyCACertPath) {
//         cachedProxyCACert = readProxyCACert(resolvedProxyCACert)
//         cachedProxyCACertPath = config.configuration.proxyCACert
//     }

//     return {
//         ...config.configuration,
//         proxyPath: cachedProxyPath,
//         proxyCACert: cachedProxyCACert,
//     }
// }
function resolveProxyPath(filePath: string | null | undefined): string | undefined {
    if (!filePath) {
        return undefined
    }

    try {
        const stats = fs.statSync(filePath)
        if (!stats.isSocket()) {
            throw new Error('Not a socket')
        }
        const mode = stats.mode
        const canRead = (mode & fs.constants.S_IRUSR) !== 0
        const canWrite = (mode & fs.constants.S_IWGRP) !== 0
        if (!(canRead && canWrite)) {
            throw new Error('Insufficient permissions')
        }
        return filePath
    } catch (error) {
        logError('vscode.configuration', `Cannot verify ${CONFIG_KEY.proxy}.path: ${filePath}: ${error}`)
        throw new Error(`Cannot verify ${CONFIG_KEY.proxy}.path: ${filePath}:\n${error}`)
    }
}

export function readProxyCACert(filePath: string | null | undefined): string | undefined {
    if (!filePath) {
        return undefined
    }

    try {
        return fs.readFileSync(filePath, { encoding: 'utf-8' })
    } catch (error) {
        logError('vscode.configuration', `Cannot read ${CONFIG_KEY.proxy}.cacert: ${filePath}: ${error}`)
        throw new Error(`Error reading ${CONFIG_KEY.proxy}.cacert from ${filePath}:\n${error}`)
    }
}

function isInlineCert(pathOrCert: string | null | undefined): boolean {
    return (
        (pathOrCert?.startsWith('-----BEGIN CERTIFICATE-----') ||
            pathOrCert?.startsWith('-----BEGIN PKCS7-----')) ??
        false
    )
}

function normalizePath(filePath: string | null | undefined): string | undefined {
    if (!filePath) {
        return undefined
    }

    let normalizedPath = filePath
    for (const homeDir of ['~/', '%USERPROFILE%\\']) {
        if (filePath?.startsWith(homeDir)) {
            normalizedPath = path.join(os.homedir(), filePath.slice(homeDir.length))
        }
    }

    if (!path.isAbsolute(normalizedPath)) {
        throw new Error(`Path ${filePath} is not absolute`)
    }

    return normalizedPath
}

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

// The path to the exported class can be found in the npm contents
// https://www.npmjs.com/package/@vscode/proxy-agent?activeTab=code

const _IMPORT_NODE_MODULES = '_VSCODE_NODE_MODULES'
const _IMPORT_PROXY_AGENT_PATH = '@vscode/proxy-agent/out/agent'
const _IMPORT_PAC_PROXY_AGENT = 'PacProxyAgent'
export function patchNetworkStack(context: Pick<vscode.ExtensionContext, 'extensionUri'>): void {
    globalAgentRef.blockEarlyAccess = true
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
        // We make a fake agent here so that the module we want to patch is loaded
        //@ts-ignore
        const httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 60000 })
        //@ts-ignore
        const httpsAgent = new https.Agent({
            ...https.globalAgent.options,
            keepAlive: true,
            keepAliveMsecs: 60000,
        })
        const _PacProxyAgent = (globalThis as any)?.[_IMPORT_NODE_MODULES]?.[_IMPORT_PROXY_AGENT_PATH]?.[
            _IMPORT_PAC_PROXY_AGENT
        ] as { new (resolver: any, opts: any): AgentBase } & { [K in keyof AgentBase]: AgentBase[K] }

        if (!_PacProxyAgent) {
            logDebug('fetch.node', 'TODO: Not patching stuff.')
            // WE don't handle this yet, we rely on the fact that Sourcegraph
            // HTTP Client and Completions client explicitly set agent.current
            // as their agent (which will be respected if PacProxy is not
            // interfering)
            return
        }

        patchVSCodeModule(http)
        patchVSCodeModule(https)

        /**?? customAgent**/
        //TODO: Logging!
        // const _constructor = _PacProxyAgent.prototype.constructor
        // _PacProxyAgent.prototype.constructor = (resolver: any, opts: any) =>
        //     new Proxy(_constructor(resolver, opts), {
        //         getPrototypeOf(target) {
        //             return Object.getPrototypeOf(target)
        //         },
        //         get(target, prop, receiver) {
        //             if (prop === 'connect') {
        //                 return async function (
        //                     req: http.ClientRequest,
        //                     opts: http.RequestOptions & { _codyAgent?: DelegatingProxyAgent | unknown }
        //                 ) {
        //                     if (!(opts._codyAgent instanceof DelegatingProxyAgent)) {
        //                         // biome-ignore lint/style/noArguments: apply uses arguments array
        //                         return target.connect.apply(target, arguments)
        //                     }
        //                     console.log('Overridden connect method called')
        //                     // New connection logic here
        //                     // You can still call the original method if needed:
        //                     // return target.connect.apply(target, arguments);
        //                 }
        //             }
        //             return Reflect.get(target, prop, receiver)
        //         },
        //     })
        // this actually in "VSCode 'Extension Host'"

        const originalConnect = _PacProxyAgent.prototype.connect
        _PacProxyAgent.prototype.connect = async function (
            req: http.ClientRequest,
            opts: AgentConnectOpts & { _codyAgent?: DelegatingProxyAgent | unknown }
        ): Promise<any> {
            if (!(opts._codyAgent instanceof DelegatingProxyAgent)) {
                // biome-ignore lint/style/noArguments: apply uses arguments array
                return originalConnect.apply(this, arguments)
            }

            return opts._codyAgent.connect(req, { ...opts, prevAgent: this })
        }
    } catch {}
}

function patchVSCodeModule(originalModule: typeof http | typeof https) {
    function patch(
        originalFn: typeof http.get | typeof https.get | typeof http.request | typeof https.request
    ) {
        const patchedFn: typeof originalFn = (...args: any[]): any => {
            let [url, options, callback] = args
            if (typeof url !== 'string' && !(url && (<any>url).searchParams)) {
                callback = <any>options
                options = url
                url = null
            }
            if (typeof options === 'function') {
                callback = options
                options = null
            }
            options = options || {}
            if (options.agent instanceof DelegatingProxyAgent) {
                // instead we move it to _codyAgent so that our proxy handler works correctly
                return originalFn(
                    url,
                    { ...options, _codyAgent: options.agent, agent: undefined },
                    callback
                )
            }
            return originalFn(url, options, callback)
        }
        return patchedFn
    }
    originalModule.get = patch(originalModule.get)
    originalModule.request = patch(originalModule.request)
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
// @ts-ignore
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
