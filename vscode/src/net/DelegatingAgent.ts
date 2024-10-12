import * as fs from 'node:fs'
import type { Agent } from 'node:http'
import * as http from 'node:http'
import * as https from 'node:https'
import * as net from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import type stream from 'node:stream'
import * as tls from 'node:tls'
import * as url from 'node:url'
import {
    type NetConfiguration,
    cenv,
    distinctUntilChanged,
    firstValueFrom,
    globalAgentRef,
    logError,
    resolvedConfig,
    shareReplay,
    startWith,
    subscriptionDisposable,
} from '@sourcegraph/cody-shared'
import { Agent as AgentBase, type AgentConnectOpts } from 'agent-base'
import { HttpsProxyAgent, type HttpsProxyAgentOptions } from 'https-proxy-agent'
import omit from 'lodash/omit'
import { map } from 'observable-fns'
import { ProxyAgent } from 'proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
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

    private constructor() {
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
            map(v => {
                const { proxy, bypassVSCode } = v.configuration.net
                return { proxy, bypassVSCode }
            }),
            distinctUntilChanged()
        )
        //Note: This is split into two pipes because observable-fns sadly hasn't
        //used recursive types properly so after 7 elements the typing breaks.
        .pipe(map(normalizeSettings), distinctUntilChanged(), map(resolveSettings))
        .pipe(distinctUntilChanged(), shareReplay())

    readonly configurationError = this.config.pipe(
        map(config => {
            return config.error ?? null
        }),
        distinctUntilChanged(),
        shareReplay()
    )

    static async initialize() {
        if (globalAgentRef.isSet) {
            throw new Error('Already initialized')
        }
        // debugFile = await openEmptyEditor()
        const agent = new DelegatingAgent()
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

        const agentId = `${proxyPath ?? proxyServer?.protocol ?? 'direct'}+${
            options.secureEndpoint ? 'https:' : 'http:'
        }`
        const cachedAgent = this.agentCache.get(agentId)
        let agent = cachedAgent
        if (!agent) {
            if (proxyPath) {
                agent = new ProxyAgent({
                    ...reqOptions,
                    socketPath: proxyPath,
                })
            }
            if (proxyServer) {
                switch (proxyServer.protocol) {
                    case 'http:':
                    case 'https:':
                        agent = new FixedHttpsProxyAgent(proxyServer.href, reqOptions, {
                            ca: config.ca,
                            requestCert: !config.skipCertValidation,
                            rejectUnauthorized: !config.skipCertValidation,
                        })
                        break
                    case 'socks:':
                    case 'socks4:':
                    case 'socks4a:':
                    case 'socks5:':
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
            const ctor = options.secureEndpoint ? https.Agent : http.Agent
            agent = new ctor(reqOptions)
        }
        if (agent !== cachedAgent) {
            this.agentCache.set(agentId, agent)
        }
        return agent
    }
}

async function buildCaCerts(additional: string[] | null | undefined): Promise<(string | Buffer)[]> {
    // TODO: Probably want to load in the VSCode certs as well if available
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

    return [...combined.values()]
}

type NormalizedSettings = {
    bypassVSCode: boolean | null
    proxyPath: string | null
    proxyServer: URL | null
    proxyCACert: string | null
    skipCertValidation: boolean
    proxyCACertPath: string | null
}
function normalizeSettings(raw: NetConfiguration): [Error, null] | [null, NormalizedSettings] {
    try {
        const caCertConfig = isInlineCert(raw.proxy?.cacert)
            ? ({ proxyCACert: raw.proxy?.cacert ?? null, proxyCACertPath: null } as const)
            : ({ proxyCACert: null, proxyCACertPath: normalizePath(raw.proxy?.cacert) } as const)

        const proxyServerString = raw.proxy?.server?.trim() || cenv.CODY_DEFAULT_PROXY || null
        const proxyServer = proxyServerString ? new url.URL(proxyServerString) : null
        const proxyPath = normalizePath(raw.proxy?.path)
        return [
            null,
            {
                bypassVSCode: raw.bypassVSCode ?? !!proxyServer ?? !!proxyPath,
                skipCertValidation: raw.proxy?.skipCertValidation || false,
                ...caCertConfig,
                proxyPath,
                proxyServer,
            },
        ]
    } catch (e: any) {
        return [e, null]
    }
}

type ResolvedSettings = {
    error: Error | null
    proxyServer: URL | null
    proxyPath: string | null
    ca: (string | Buffer)[]
    skipCertValidation: boolean
    bypassVSCode: boolean
}
async function resolveSettings([error, settings]:
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
        } satisfies ResolvedSettings
    }
    const proxyPath = resolveProxyPath(settings.proxyPath) || null
    const caCert = settings.proxyCACert || readProxyCACert(settings.proxyCACertPath) || null
    return {
        bypassVSCode:
            typeof settings.bypassVSCode === 'boolean'
                ? settings.bypassVSCode
                : !!settings.proxyServer || !!settings.proxyPath || false,
        error: null,
        proxyServer: settings.proxyServer || null,
        proxyPath,
        ca: await buildCaCerts(caCert ? [caCert] : null),
        skipCertValidation: settings.skipCertValidation,
    }
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
            `Cannot verify ${CONFIG_KEY.net}.proxy.path: ${filePath}: ${error}`
        )
        throw new Error(`Cannot verify ${CONFIG_KEY.net}.proxy.path: ${filePath}:\n${error}`)
    }
}

export function readProxyCACert(filePath: string | null | undefined): string | undefined {
    if (!filePath) {
        return undefined
    }

    try {
        return fs.readFileSync(filePath, { encoding: 'utf-8' })
    } catch (error) {
        logError(
            'vscode.configuration',
            `Cannot read ${CONFIG_KEY.net}.proxy.cacert: ${filePath}: ${error}`
        )
        throw new Error(`Error reading ${CONFIG_KEY.net}.proxy.cacert from ${filePath}:\n${error}`)
    }
}

function isInlineCert(pathOrCert: string | null | undefined): boolean {
    return (
        pathOrCert?.startsWith('-----BEGIN CERTIFICATE-----') ||
        pathOrCert?.startsWith('-----BEGIN PKCS7-----') ||
        false
    )
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

type TlsUpgradeOpts = Omit<tls.ConnectionOptions, 'path' | 'port' | 'host' | 'socket' | 'servername'>
class FixedHttpsProxyAgent<Uri extends string> extends HttpsProxyAgent<Uri> {
    constructor(
        uri: Uri,
        opts?: HttpsProxyAgentOptions<Uri> | undefined,
        private tlsUpgradeOpts: TlsUpgradeOpts = {}
    ) {
        super(uri, opts)
    }

    private upgradeSocketToTls(
        socket: net.Socket,
        servername: string | undefined,
        opts: tls.ConnectionOptions
    ) {
        return tls.connect({
            ...opts,
            ...this.tlsUpgradeOpts,
            socket,
            servername: !servername || net.isIP(servername) ? undefined : servername,
        })
    }

    async connect(req: http.ClientRequest, opts: AgentConnectOpts): Promise<net.Socket> {
        // We temporarily disable secureEndpoint on the opts to ensure that we're given back control to create the tls socket.
        // This is done so that we can apply the logic from https://github.com/TooTallNate/proxy-agents/pull/235
        const socket = await super.connect(req, { ...opts, secureEndpoint: false })
        // check that it's not a fake socket
        if (!socket.writable) {
            return socket
        }
        if (opts.secureEndpoint) {
            // The proxy is connecting to a TLS server, so upgrade
            // this socket connection to a TLS connection.
            const servername = opts.servername || opts.host
            return this.upgradeSocketToTls(socket, servername, omit(opts, 'host', 'path', 'port'))
        }
        return socket
    }
}
