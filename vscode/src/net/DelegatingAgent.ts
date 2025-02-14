import * as fs from 'node:fs'
import type { Agent } from 'node:http'
import * as http from 'node:http'
import * as https from 'node:https'
import * as os from 'node:os'
import * as path from 'node:path'
import type stream from 'node:stream'
import * as tls from 'node:tls'
import * as url from 'node:url'
import type { URL } from 'node:url'
import type { Noxide } from '@sourcegraph/cody-noxide'
import {
    type NetConfiguration,
    cenv,
    distinctUntilChanged,
    firstValueFrom,
    globalAgentRef,
    logDebug,
    logError,
    resolvedConfig,
    shareReplay,
    startWith,
    subscriptionDisposable,
} from '@sourcegraph/cody-shared'
import { Agent as AgentBase, type AgentConnectOpts } from 'agent-base'
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent'
import { map } from 'observable-fns'
import { ProxyAgent } from 'proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import type { WritableDeep } from 'type-fest'
import type * as vscode from 'vscode'
import { getConfiguration } from '../configuration'
import { CONFIG_KEY } from '../configuration-keys'
import { bypassVSCodeSymbol } from './net.patch'

const TIMEOUT = 60_000

export class DelegatingAgent extends AgentBase implements vscode.Disposable {
    [bypassVSCodeSymbol](): boolean {
        if (!this.latestConfig) {
            // This means someone made a network call before we've started. Naughty!
            throw new Error('Network call was dispatched before DelegatingAgent was initialized')
        }
        return this.latestConfig.bypassVSCode
    }

    private disposables: vscode.Disposable[] = []
    private latestConfig: ResolvedSettings | null = null // we need sync access for VSCode to work
    private agentCache: Map<string, AgentBase | http.Agent | https.Agent> = new Map()

    private constructor(private readonly ctx: { noxide?: Noxide | undefined }) {
        super()
        this.disposables.push(
            subscriptionDisposable(
                this.config.subscribe(latestConfig => {
                    this.latestConfig = latestConfig
                    const expiredAgents = [...this.agentCache.values()]
                    this.agentCache.clear()
                    if (expiredAgents.length > 0) {
                        setTimeout(() => {
                            for (const agent of expiredAgents) {
                                agent.destroy()
                            }
                        }, TIMEOUT)
                    }
                })
            )
        )
    }

    destroy(): void {
        this.dispose()
    }

    dispose() {
        this.latestConfig = null
        for (const agent of this.agentCache.values()) {
            agent.destroy()
        }
        this.agentCache.clear()
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
        super.destroy()
    }

    private config = resolvedConfig
        .pipe(
            // This ensures we can "boot" before config is resolved.
            startWith({
                configuration: getConfiguration(),
            }),
            map(v => v.configuration.net),
            distinctUntilChanged()
        )
        //Note: This is split into two pipes because observable-fns sadly hasn't
        //used recursive types properly so after 7 elements the typing breaks.
        .pipe(map(normalizeSettings), distinctUntilChanged(), map(this.resolveSettings.bind(this)))
        .pipe(distinctUntilChanged(), shareReplay())

    private _configVersion = 0
    readonly configVersion = this.config.pipe(
        distinctUntilChanged(),
        map(_ => this._configVersion++),
        shareReplay()
    )

    readonly configurationError = this.config.pipe(
        map(config => {
            return config.error ?? null
        }),
        distinctUntilChanged(),
        shareReplay()
    )

    static async initialize(ctx: { noxide?: Noxide | undefined }) {
        if (globalAgentRef.isSet) {
            throw new Error('Already initialized')
        }
        // debugFile = await openEmptyEditor()
        const agent = new DelegatingAgent(ctx)
        await firstValueFrom(agent.config)
        globalAgentRef.agent = agent
        return agent
    }

    async connect(
        req: http.ClientRequest & https.RequestOptions,
        options: AgentConnectOpts & { _vscode?: { utils: number } }
    ): Promise<stream.Duplex | Agent> {
        const config = this.latestConfig
        if (!config) {
            // This somehow means connect was called before we were initialized
            throw new Error('Connect called before agent was initialized')
        }

        const reqOptions = {
            keepAlive: false, // <-- this CAN NOT be enabled safely due to needing considerable re-work of reliance on 'close' events etc.
            ALPNProtocols: ['http/1.1'], // http2 support would require significant rework of proxies etc.
            scheduling: 'lifo', // Just so we always keep autocomplete snappy
            noDelay: true,
            maxSockets: Number.POSITIVE_INFINITY,
            timeout: TIMEOUT,
            ca: config.ca,
            rejectUnauthorized: !config.skipCertValidation,
        } as const

        const { proxyServer, proxyPath } = config

        // This technically isn't optimal as we're creating different agents for different
        // endpoints. However, given that our own application only uses a few endpoints
        // this not only simplifies the logic, it aslo makes it less likely that things like
        // fast-paths, which have different TTL & connection parameters can start interfering with
        // connection reliability for other domains.
        const reqProto = `${options.protocol || options.secureEndpoint ? 'https:' : 'http:'}`
        const reqId = `${reqProto}//${options.host ?? ''}:${options.port ?? ''}`
        const agentId = `${proxyPath ?? proxyServer?.protocol ?? 'direct'}+${reqId}`

        const defaultAgent = options.secureEndpoint ? https.Agent : http.Agent

        const cachedAgent = this.agentCache.get(agentId)
        let agent = cachedAgent
        if (!agent) {
            if (!shouldProxy(options, config.noProxyString)) {
                logDebug(
                    'Delegating Agent',
                    `Initialized new agent <${agentId}> as [default] due to NO_PROXY rule`
                )
                agent = new defaultAgent(reqOptions)
            } else if (proxyPath) {
                logDebug('Delegating Agent', `Initialized new agent <${agentId}> as [path]`)
                agent = new ProxyAgent({
                    ...reqOptions,
                    socketPath: proxyPath,
                })
            } else if (proxyServer) {
                switch (proxyServer.protocol) {
                    case 'http:':
                    case 'https:':
                        logDebug('Delegating Agent', `Initialized new agent <${agentId}> as [http]`)
                        if (options.secureEndpoint) {
                            agent = new HttpsProxyAgent({
                                ...(reqOptions as WritableDeep<typeof reqOptions>),
                                proxy: proxyServer.href,
                                proxyRequestOptions: {
                                    // headers: TODO, allow for auth headers
                                    ca: config.ca,
                                    rejectUnauthorized: !config.skipCertValidation,
                                },
                            })
                        } else {
                            agent = new HttpProxyAgent({
                                ...(reqOptions as WritableDeep<typeof reqOptions>),
                                proxy: proxyServer.href,
                                proxyRequestOptions: {
                                    // headers: TODO, allow for auth headers
                                    ca: config.ca,
                                    rejectUnauthorized: !config.skipCertValidation,
                                },
                            })
                        }
                        break
                    case 'socks:':
                    case 'socks4:':
                    case 'socks4a:':
                    case 'socks5:':
                        logDebug('Delegating Agent', `Initialized new agent <${agentId}> as [sock]`)
                        agent = new SocksProxyAgent(proxyServer.href, reqOptions)
                        break
                    default:
                        logError(
                            'DelegatingProxy',
                            'Unsupported proxy protocol, falling back to direct',
                            proxyServer.protocol
                        )
                        break
                }
            }
        }
        if (!agent) {
            agent = new defaultAgent(reqOptions)
        }
        if (agent !== cachedAgent) {
            this.agentCache.set(agentId, agent)
        }
        return agent
    }

    async resolveSettings([error, settings]:
        | [Error, null]
        | [null, NormalizedSettings]): Promise<ResolvedSettings> {
        if (error) {
            return {
                error,
                bypassVSCode: false,
                ca: [],
                proxyPath: null,
                proxyServer: null,
                skipCertValidation: false,
                vscode: null,
                noProxyString: null,
            } satisfies ResolvedSettings
        }
        let proxyPath: string | null = null
        let err: Error | null = null
        let caCert: string | null = null
        try {
            proxyPath = resolveProxyPath(settings.proxyPath) || null
        } catch (error) {
            if (error instanceof Error) {
                err = error
            } else {
                err = new Error(`Could not resolve proxy path: ${error}`)
            }
        }
        if (!err) {
            try {
                caCert = settings.proxyCACert || readProxyCACert(settings.proxyCACertPath) || null
            } catch (error) {
                if (error instanceof Error) {
                    err = error
                } else {
                    err = new Error(`Could not resolve proxy path: ${error}`)
                }
            }
        }
        const ca = await this.buildCaCerts(caCert ? [caCert] : null)
        return {
            error: err,
            proxyServer: settings.proxyServer || null,
            proxyPath,
            noProxyString: settings.noProxyString,
            ca,
            skipCertValidation: settings.skipCertValidation,
            bypassVSCode: settings.bypassVSCode,
            vscode: settings.vscode,
        }
    }

    async buildCaCerts(additional: string[] | null | undefined): Promise<string[]> {
        const tlsCA = tls.rootCertificates
        const globalAgentCa = https.globalAgent.options.ca

        const toArray = (
            v: Buffer | string | (string | Buffer)[] | null | undefined
        ): (string | Buffer)[] => {
            if (v === null || v === undefined) {
                return []
            }
            if (Buffer.isBuffer(v)) {
                return [v]
            }
            if (typeof v === 'string') {
                return [v]
            }
            return v
        }

        const combined = new Set([...tlsCA, ...toArray(globalAgentCa), ...(additional ?? [])])

        const legacyCerts = [...combined.values()]
        const stringCerts = legacyCerts
            .map(cert => (Buffer.isBuffer(cert) ? cert.toString('utf8') : cert))
            .filter(cert => typeof cert === 'string')
        const failedConversionCount = stringCerts.length - legacyCerts.length
        if (failedConversionCount) {
            logError(
                'DelegatingProxy',
                `Skipping ${failedConversionCount} CA certs that could not be convert to a string`,
                {
                    legacyCerts,
                    stringCerts,
                }
            )
        }

        // There seems to be very little performance overhead for loading system
        // certs via noxide. Therefore we do so on every config change (e.g. when this
        // function is called). This means that in contrast to how system cert
        // loading worked previously this actually will update the certs if
        // changes are made to the system certs and the config is refreshed for
        // any reason.
        try {
            const noxideCerts = this.ctx.noxide?.config.caCerts(stringCerts) ?? []
            if (!noxideCerts.length) {
                logError(
                    'DelegatingProxy',
                    'No CA certs loaded from noxide. Falling back to legacy defaults'
                )
                return stringCerts
            }
            logError('DelegatingProxy', `Loaded ${noxideCerts.length} CA certs from noxide`)
            return noxideCerts
        } catch (e) {
            logError('DelegatingProxy', 'Could not retrieve noxide CA certs', e)
        }
        return stringCerts
    }
}

type NormalizedSettings = {
    bypassVSCode: boolean
    proxyPath: string | null
    proxyServer: URL | null
    proxyCACert: string | null
    proxyCACertPath: string | null
    noProxyString: string | null
    skipCertValidation: boolean
    vscode: string | null
}
function normalizeSettings(raw: NetConfiguration): [Error, null] | [null, NormalizedSettings] {
    try {
        const caCertConfig = isInlineCert(raw.proxy?.cacert)
            ? ({ proxyCACert: raw.proxy?.cacert ?? null, proxyCACertPath: null } as const)
            : ({ proxyCACert: null, proxyCACertPath: normalizePath(raw.proxy?.cacert) } as const)

        let noProxyString: string | null = null
        let proxyEndpointString = raw.proxy?.endpoint?.trim() || null
        if (!proxyEndpointString) {
            proxyEndpointString = cenv.CODY_NODE_DEFAULT_PROXY?.trim() || null
            noProxyString = cenv.CODY_NODE_NO_PROXY?.trim() || null
        }

        //TODO: named pipes on Windows won't use unix://
        let proxyServer: URL | null = null
        const proxyPath = proxyEndpointString?.startsWith('unix://')
            ? normalizePath(proxyEndpointString.slice(7))
            : null
        try {
            if (proxyEndpointString && !proxyPath) {
                proxyServer = new url.URL(proxyEndpointString)
            }
        } catch (e) {
            const errorMessage = `Proxy endpoint URL isn't valid ${proxyEndpointString}`
            logError('DelegatingProxy', `${errorMessage}:\n${e}`)
            throw new Error(`${errorMessage}:\n${e}`)
        }

        // TODO: For all other nullish types like `skipCertValidation` we try to
        // have the overrides be priority based and only apply if they're set.
        // Meaning that `skipCertValidation` should have been ?? not || as it
        // would override the config value with the environment value even if
        // the config was set. However VSCode's config doesn't give
        // undefined/null for boolean types and an extra call to config.inspect
        // is required to see if a value has been set by the user. We don't have
        // a way of doing that in our ConfigGetter wrapper.
        const skipCertValidation =
            raw.proxy?.skipCertValidation || cenv.CODY_NODE_TLS_REJECT_UNAUTHORIZED === false || false
        return [
            null,
            {
                bypassVSCode:
                    raw.mode?.toLowerCase() === 'bypass' ||
                    (raw.mode?.toLowerCase() !== 'vscode' && (!!proxyServer || !!proxyPath)),
                skipCertValidation,
                ...caCertConfig,
                proxyPath,
                proxyServer,
                noProxyString,
                vscode: raw.vscode ?? null,
            },
        ]
    } catch (e: any) {
        logError('DelegatingProxy', 'Network settings could not be resolved', { error: e })
        return [e, null]
    }
}

type ResolvedSettings = {
    error: Error | null
    proxyServer: URL | null
    proxyPath: string | null
    noProxyString: string | null
    ca: string[]
    skipCertValidation: boolean
    bypassVSCode: boolean
    vscode: string | null
}

function resolveProxyPath(filePath: string | null | undefined): string | undefined {
    if (!filePath) {
        return undefined
    }

    try {
        const stats = fs.statSync(filePath)
        if (!stats.isSocket()) {
            throw new Error('Not a socket')
        }
        fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK)
        return filePath
    } catch (error) {
        logError(
            'vscode.configuration',
            `Cannot verify ${CONFIG_KEY.netProxyEndpoint}: ${filePath}: ${error}`
        )
        throw new Error(`Cannot verify ${CONFIG_KEY.netProxyEndpoint}: ${filePath}:\n${error}`)
    }
}

function readProxyCACert(filePath: string | null | undefined): string | undefined {
    if (!filePath) {
        return undefined
    }

    try {
        return fs.readFileSync(filePath, { encoding: 'utf-8' })
    } catch (error) {
        logError(
            'vscode.configuration',
            `Cannot read ${CONFIG_KEY.netProxyCacert}: ${filePath}: ${error}`
        )
        throw new Error(`Error reading ${CONFIG_KEY.netProxyCacert} from ${filePath}:\n${error}`)
    }
}

function isInlineCert(pathOrCert: string | null | undefined): boolean {
    return pathOrCert?.startsWith('-----BEGIN CERTIFICATE-----') || false
}

function normalizePath(filePath: string | null | undefined): string | null {
    if (!filePath) {
        return null
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

const DEFAULT_PORTS: Record<string, number> = {
    ftp: 21,
    gopher: 70,
    http: 80,
    https: 443,
    ws: 80,
    wss: 443,
}

/**
 * Determines whether a given URL should be proxied.
 *
 * @param {string} hostname - The host name of the URL.
 * @param {number} port - The effective port of the URL.
 * @returns {boolean} Whether the given URL should be proxied.
 * @private
 */
function shouldProxy(
    req: { host?: string; protocol?: string; port?: number; secureEndpoint?: boolean },
    noProxy: string | null | undefined
) {
    let reqProto = req.protocol ?? (req.secureEndpoint ? 'https:' : 'http:')
    let reqHostname = req.host
    if (typeof reqHostname !== 'string' || !reqHostname || typeof reqProto !== 'string') {
        return false // Don't proxy URLs without a valid scheme or host.
    }

    reqProto = reqProto.split(':', 1)[0]
    // Stripping ports in this way instead of using parsedUrl.hostname to make
    // sure that the brackets around IPv6 addresses are kept.
    reqHostname = reqHostname.replace(/:\d*$/, '')
    const port = req.port || DEFAULT_PORTS[reqProto] || 0

    if (!noProxy) {
        return true // Always proxy if NO_PROXY is not set.
    }
    if (noProxy === '*') {
        return false // Never proxy if wildcard is set.
    }

    return noProxy?.split(/[,\s]/).every(proxy => {
        if (!proxy) {
            return true // Skip zero-length hosts.
        }
        const parsedProxy = proxy.match(/^(.+):(\d+)$/)
        let parsedProxyHostname = parsedProxy ? parsedProxy[1] : proxy
        const parsedProxyPort = parsedProxy ? Number.parseInt(parsedProxy[2]) : 0
        if (parsedProxyPort && parsedProxyPort !== port) {
            return true // Skip if ports don't match.
        }

        if (!/^[.*]/.test(parsedProxyHostname)) {
            // No wildcards, so stop proxying if there is an exact match.
            return reqHostname !== parsedProxyHostname
        }

        if (parsedProxyHostname.charAt(0) === '*') {
            // Remove leading wildcard.
            parsedProxyHostname = parsedProxyHostname.slice(1)
        }
        // Stop proxying if the hostname ends with the no_proxy host.
        return !reqHostname.endsWith(parsedProxyHostname)
    })
}
