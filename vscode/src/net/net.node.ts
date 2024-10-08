import * as fs from 'node:fs'
import type * as http from 'node:http'
import type { Agent } from 'node:http'
import * as https from 'node:https'
import * as os from 'node:os'
import * as path from 'node:path'
import type stream from 'node:stream'
import {
    type NetConfiguration,
    cenv,
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
import { map } from 'observable-fns'
import { ProxyAgent } from 'proxy-agent'
import type { LiteralUnion } from 'type-fest'
import * as vscode from 'vscode'
import { getConfiguration } from '../configuration'
import { CONFIG_KEY } from '../configuration-keys'
import type * as internalVSCodeAgent from './vscode-network-proxy'

const TIMEOUT = 60_000

export class DelegatingProxyAgent extends AgentBase implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private proxyCache = new Map<LiteralUnion<'http:' | 'https:', string>, AgentBase>()

    private constructor() {
        super()
        this.disposables.push(
            subscriptionDisposable(
                this.config.subscribe(() => {
                    const expired = [...this.proxyCache.values()]
                    this.proxyCache.clear()
                    if (expired.length > 0) {
                        setTimeout(() => {
                            for (const agent of expired) {
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
        .pipe(
            map(normalizeSettings),
            distinctUntilChanged(),
            map(resolveSettings),
            mapError((error: Error) => {
                return {
                    error,
                    preferInternalAgents: false,
                    caCert: null,
                    proxyPath: null,
                    proxyServer: null,
                } satisfies ResolvedSettings
            })
        )
        .pipe(distinctUntilChanged(), shareReplay())

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
        req: http.ClientRequest & https.RequestOptions,
        options: AgentConnectOpts & { _vscodeAgent?: Pick<AgentBase, 'connect'> }
    ): Promise<stream.Duplex | Agent> {
        const config = await firstValueFrom(this.config)

        if (options._vscodeAgent && !config.preferInternalAgents) {
            if (config.proxyPath) {
                req.socketPath = config.proxyPath
            }
            req.setNoDelay(true)
            req.setTimeout(TIMEOUT)
            // req.setSocketKeepAlive(true,30_000) <-- this is NOT a good idea to do
            // globally as it can cause all sorts of issues if we're not in full
            // control.

            // these simply return a socket so we can't cache the agent :shrug:
            return options._vscodeAgent.connect(req, {
                ...options,
                //@ts-ignore
                _vscodeAgent: undefined, // we must ensure _vscodeAgent is unset as VSCode might call us again
            })
        }

        /*
        We could/should be handling all requests ourselves  in the future.
        Especially because it will allow us to properly re-use agents and handle
        keep-alives, socket timeouts, etc. However there is a lot of nuance in
        doing so. Because of this for now we simply don't do this yet and hand
        back to VSCode unless we need to specifically handle something
        ourselves.

        When we do we can yoink some of the helpers functions passed in params
        to vscode/PacProxyAgent:
        - Reading platform (on extension host) proxy info through `resolveProxy`
        - Reading additional certs through `getOrLoadAdditionalCertificates` and
          deciding on V1 (patched ._vscodeAdditionalCerts param picked up in
          tls.createSecureContext) or V2 (certs added directly)
        - Handling of (kerberos) proxy-authorization & re-connection (e.g. the
          point of `HttpsProxyAgent2` in
          `vscode-proxy-agent/blob/main/src/agent.ts`
        - ...

        Or alternatively just implement a native network stack that more
        graceuflly handles these settings internally.
        */

        let protocol = options.protocol || 'https:'
        if (!options.protocol && options.port === 80) {
            protocol = 'http:'
        }

        let agent = this.proxyCache.get(protocol)
        if (!agent) {
            agent = buildAgent(config)
            this.proxyCache.set(protocol, agent)
        }

        return agent.connect(req, options)
    }
}

function buildAgent(config: ResolvedSettings): AgentBase {
    const ca = additionalCACerts(config.caCert)

    return new ProxyAgent({
        keepAlive: true,
        keepAliveMsecs: 10_000,
        ALPNProtocols: ['http/1.1'], // for now
        scheduling: 'lifo', // Just so we always keep autocomplete snappy
        maxSockets: Number.POSITIVE_INFINITY,
        maxFreeSockets: 256,
        timeout: TIMEOUT,
        socketPath: config.proxyPath ?? undefined,
        fallbackToDirect: true,
        getProxyForUrl: (_: string) => {
            if (config.proxyPath) {
                // we can't have proxy and socket path at the same time
                return ''
            }
            return config.proxyServer || cenv.CODY_DEFAULT_PROXY || ''
        },
        //TODO: Properly handle all cert scenarios
        ...(ca ? { ca } : { rejectUnauthorized: false }),
    })
}

function additionalCACerts(additional: string | null) {
    if (!additional) {
        return undefined
    }

    // TODO: Technically these certs might need to be split and converted to PEM
    // TODO: Probably want to load in the VSCode certs as well if available
    // TODO: Need a more solid workaround than ca-cert.exe we use now
    const globalCA = https.globalAgent.options.ca

    if (!globalCA) {
        return [additional]
    }

    if (Buffer.isBuffer(globalCA)) {
        return [globalCA, additional]
    }

    if (typeof globalCA === 'string') {
        return [globalCA, additional]
    }

    if (Array.isArray(globalCA)) {
        return [...globalCA, additional]
    }

    return [additional]
}

type NormalizedSettings = {
    bypassVSCode: boolean | null
    proxyPath: string | null
    proxyServer: string | null
    proxyCACert: string | null
    proxyCACertPath: string | null
}
function normalizeSettings(raw: NetConfiguration): NormalizedSettings {
    const caCertConfig = isInlineCert(raw.proxy?.cacert)
        ? ({ proxyCACert: raw.proxy?.cacert ?? null, proxyCACertPath: null } as const)
        : ({ proxyCACert: null, proxyCACertPath: normalizePath(raw.proxy?.cacert) } as const)

    const proxyServer = raw.proxy?.server?.trim() || null

    return {
        bypassVSCode: raw.bypassVSCode ?? null,
        ...caCertConfig,
        proxyPath: normalizePath(raw.proxy?.path),
        proxyServer,
    }
}

type ResolvedSettings = {
    error: Error | null
    proxyServer: string | null
    proxyPath: string | null
    caCert: string | null
    preferInternalAgents: boolean
}
function resolveSettings(settings: NormalizedSettings): ResolvedSettings {
    const proxyPath = resolveProxyPath(settings.proxyPath) || null
    const caCert = settings.proxyCACert || readProxyCACert(settings.proxyCACertPath) || null
    return {
        preferInternalAgents:
            typeof settings.bypassVSCode === 'boolean'
                ? settings.bypassVSCode
                : !!settings.proxyServer || !!settings.proxyPath || false,
        error: null,
        proxyServer: settings.proxyServer || null,
        proxyPath,
        caCert,
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
        const mode = stats.mode
        const canRead = (mode & fs.constants.S_IRUSR) !== 0
        const canWrite = (mode & fs.constants.S_IWGRP) !== 0
        if (!(canRead && canWrite)) {
            throw new Error('Insufficient permissions')
        }
        return filePath
    } catch (error) {
        logError(
            'vscode.configuration',
            `Cannot verify ${CONFIG_KEY.netProxy}.path: ${filePath}: ${error}`
        )
        throw new Error(`Cannot verify ${CONFIG_KEY.netProxy}.proxy.path: ${filePath}:\n${error}`)
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
            `Cannot read ${CONFIG_KEY.netProxy}.cacert: ${filePath}: ${error}`
        )
        throw new Error(`Error reading ${CONFIG_KEY.netProxy}.cacert from ${filePath}:\n${error}`)
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

export function patchNetworkStack(): void {
    globalAgentRef.blockEarlyAccess = true

    const _PacProxyAgent = requireInternalVSCodeAgent()?.PacProxyAgent
    // const mod = Object.keys(require.cache)?.find(v => v.endsWith('@vscode/proxy-agent/out/agent.js'))
    // _PacProxyAgent = mod ? (require.cache[mod] as any)?.exports?.PacProxyAgent : null
    //TODO: has the module so we can log changes in versions for future

    //TODO: We might need to fallback to previous _VSCODE_NODE_MODULES hack for older versions?
    // const _IMPORT_NODE_MODULES = '_VSCODE_NODE_MODULES'
    // const _IMPORT_PROXY_AGENT_PATH = '@vscode/proxy-agent/out/agent'
    // const _IMPORT_PAC_PROXY_AGENT = 'PacProxyAgent'

    if (!_PacProxyAgent) {
        logDebug('fetch.node', 'TODO: Not patching stuff.')
        // WE don't handle this yet, we rely on the fact that Sourcegraph
        // HTTP Client and Completions client explicitly set agent.current
        // as their agent (which will be respected if PacProxy is not
        // interfering)
        return
    }
    // biome-ignore lint/style/useNodejsImportProtocol: <explanation>
    const _http = require('http')
    // biome-ignore lint/style/useNodejsImportProtocol: <explanation>
    const _https = require('https')
    mergeModules(_http, patchVSCodeModule(_http))
    mergeModules(_https, patchVSCodeModule(_https))

    const originalConnect = _PacProxyAgent.prototype.connect
    _PacProxyAgent.prototype.connect = async function (
        req: http.ClientRequest & https.RequestOptions,
        opts: AgentConnectOpts & { _codyAgent?: DelegatingProxyAgent | unknown; agent?: any }
    ): Promise<any> {
        if (!(opts._codyAgent instanceof DelegatingProxyAgent)) {
            //@ts-ignore
            // biome-ignore lint/style/noArguments: apply uses arguments array
            return originalConnect.apply(this, arguments)
        }

        // By setting this we can ensure that the fallback to VSCode's internal
        // proxy is still maintained. As such the order is:
        // 1. Allow our DelegatingProxyAgent to give it a shot
        // 2  If DelegatingProxyAgent decides it's not a priority it hands it back to VSCode
        // 3. If VSCode has proxy disabled it hands back to the req.proxy...which is us again
        req.agent = opts._codyAgent
        return opts._codyAgent.connect(req, {
            ...opts,
            _vscodeAgent: { connect: originalConnect.bind(this) },
            //@ts-ignore
            _codyAgent: undefined,
        })
    }
}

function mergeModules(module: any, patch: any) {
    return Object.assign(module.default || module, patch)
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
            if (url) {
                const parsed = typeof url === 'string' ? new URL(url) : url
                const urlOptions = {
                    protocol: parsed.protocol,
                    hostname:
                        parsed.hostname.lastIndexOf('[', 0) === 0
                            ? parsed.hostname.slice(1, -1)
                            : parsed.hostname,
                    port: parsed.port,
                    path: `${parsed.pathname}${parsed.search}`,
                }
                if (parsed.username || parsed.password) {
                    options.auth = `${parsed.username}:${parsed.password}`
                }
                options = { ...urlOptions, ...options }
            } else {
                options = { ...options }
            }
            if (options.agent instanceof DelegatingProxyAgent) {
                // instead we move it to _codyAgent so that our proxy handler works correctly
                options._codyAgent = options.agent
                options.agent = undefined
            }
            return originalFn(options, callback)
        }
        return patchedFn
    }
    return { get: patch(originalModule.get), request: patch(originalModule.request) }
}

function requireInternalVSCodeAgent(): typeof internalVSCodeAgent | undefined {
    try {
        return requireFromApp('vscode-proxy-agent/out/agent')
    } catch {}

    try {
        return requireFromApp('@vscode/proxy-agent/out/agent')
    } catch {}

    return undefined
}

function requireFromApp(moduleName: string) {
    const appRoot = vscode.env.appRoot
    try {
        return require(`${appRoot}/node_modules.asar/${moduleName}`)
    } catch (err) {
        // Not in ASAR.
    }
    try {
        return require(`${appRoot}/node_modules/${moduleName}`)
    } catch (err) {
        // Not available.
    }
    throw new Error(`Could not load ${moduleName} from ${appRoot}`)
}
