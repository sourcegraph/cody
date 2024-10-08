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

import { proxyIdentifierSybmol } from './patch-vscode'

const TIMEOUT = 60_000

let debugFile: vscode.TextEditor | undefined
function appendText(editor: vscode.TextEditor | undefined, string: string) {
    if (!editor) {
        return
    }
    void editor.edit(builder => {
        builder.insert(editor.document.lineAt(editor.document.lineCount - 1).range.end, string + '\n')
    })
}
async function openEmptyEditor() {
    const document = await vscode.workspace.openTextDocument({ language: 'jsonl' })
    return await vscode.window.showTextDocument(document)
}

export class DelegatingAgent extends AgentBase implements vscode.Disposable {
    [proxyIdentifierSybmol] = true // this is what the network patch uses to identify this proxy

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
        debugFile = await openEmptyEditor()
        const agent = new DelegatingAgent()
        await firstValueFrom(agent.config)
        globalAgentRef.curr = agent
        return agent
    }

    async connect(
        req: http.ClientRequest & https.RequestOptions,
        options: AgentConnectOpts & { _vscodeAgent?: Pick<AgentBase, 'connect'> }
    ): Promise<stream.Duplex | Agent> {
        const config = await firstValueFrom(this.config)

        appendText(
            debugFile,
            `${JSON.stringify({ action: 'CONNECT', url: { host: req.host, path: req.path } })}`
        )
        addRequestTimings(req, timings => {
            //write a line to the file
            appendText(
                debugFile,
                JSON.stringify({ url: { host: req.host, path: req.path }, ...timings })
            )
        })

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
        keepAlive: false, // <-- this CAN NOT be enabled safely due to needing considerable re-work of reliance on 'close' events etc.
        ALPNProtocols: ['http/1.1'], // for now
        scheduling: 'lifo', // Just so we always keep autocomplete snappy
        maxSockets: Number.POSITIVE_INFINITY,
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

interface RequestTimings {
    startTime: number
    socket?: number
    lookup?: number
    connect?: number
    response?: number
    end?: number
    finish?: number
    connectError?: Error
    responseError?: Error
}
function addRequestTimings(req: http.ClientRequest, callback: (timings: RequestTimings) => void) {
    const startTime = performance.now()

    const timings: RequestTimings = {
        startTime,
    }

    req.on('socket', socket => {
        timings.socket = performance.now() - startTime

        socket.on('lookup', () => {
            timings.lookup = performance.now() - startTime
        })

        socket.on('connect', () => {
            timings.connect = performance.now() - startTime
        })

        socket.on('error', err => {
            timings.connectError = err
        })
    })

    req.on('response', res => {
        timings.response = performance.now() - startTime

        res.on('end', () => {
            timings.end = performance.now() - startTime
        })
    })

    req.on('error', err => {
        timings.responseError = err
        timings.end = performance.now() - startTime
    })

    req.on('close', () => {
        timings.finish = performance.now() - startTime
        callback(timings)
    })
}
