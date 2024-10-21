/// <reference types="node" />

import type * as http from 'node:http'
import type * as https from 'node:https'
import type * as net from 'node:net'
import type * as tls from 'node:tls'
import type * as nodeurl from 'node:url'
import type { Agent } from 'agent-base'

//TODO: Better typing
export class PacProxyAgent implements Agent {
    connect: (req: any, options: any) => any | Promise<any>
}

export declare enum LogLevel {
    Trace = 0,
    Debug = 1,
    Info = 2,
    Warning = 3,
    Error = 4,
    Critical = 5,
    Off = 6,
}
export type ProxyResolveEvent = {
    count: number
    duration: number
    errorCount: number
    cacheCount: number
    cacheSize: number
    cacheRolls: number
    envCount: number
    settingsCount: number
    localhostCount: number
    envNoProxyCount: number
    results: ConnectionResult[]
}
interface ConnectionResult {
    proxy: string
    connection: string
    code: string
    count: number
}
export type LookupProxyAuthorization = (
    proxyURL: string,
    proxyAuthenticate: string | string[] | undefined,
    state: Record<string, any>
) => Promise<string | undefined>
export interface Log {
    trace(message: string, ...args: any[]): void
    debug(message: string, ...args: any[]): void
    info(message: string, ...args: any[]): void
    warn(message: string, ...args: any[]): void
    error(message: string | Error, ...args: any[]): void
}
export interface ProxyAgentParams {
    resolveProxy(url: string): Promise<string | undefined>
    getProxyURL: () => string | undefined
    getProxySupport: () => ProxySupportSetting
    addCertificatesV1: () => boolean
    addCertificatesV2: () => boolean
    loadAdditionalCertificates(): Promise<string[]>
    lookupProxyAuthorization?: LookupProxyAuthorization
    log: Log
    getLogLevel(): LogLevel
    proxyResolveTelemetry(event: ProxyResolveEvent): void
    useHostProxy: boolean
    env: NodeJS.ProcessEnv
}
export declare function createProxyResolver(params: ProxyAgentParams): (
    flags: {
        useProxySettings: boolean
        addCertificatesV1: boolean
    },
    req: http.ClientRequest,
    opts: http.RequestOptions,
    url: string,
    callback: (proxy?: string) => void
) => void
export type ProxySupportSetting = 'override' | 'fallback' | 'on' | 'off'
export declare function createHttpPatch(
    params: ProxyAgentParams,
    originals: typeof http | typeof https,
    resolveProxy: ReturnType<typeof createProxyResolver>
): {
    get: (
        url?: string | nodeurl.URL | null,
        options?: http.RequestOptions | null,
        callback?: ((res: http.IncomingMessage) => void) | undefined
    ) => http.ClientRequest
    request: (
        url?: string | nodeurl.URL | null,
        options?: http.RequestOptions | null,
        callback?: ((res: http.IncomingMessage) => void) | undefined
    ) => http.ClientRequest
}
export interface SecureContextOptionsPatch {
    _vscodeAdditionalCaCerts?: (string | Buffer)[]
}
export declare function createNetPatch(
    params: ProxyAgentParams,
    originals: typeof net
): {
    connect: typeof net.connect
}
export declare function createTlsPatch(
    params: ProxyAgentParams,
    originals: typeof tls
): {
    connect: typeof tls.connect
    createSecureContext: typeof tls.createSecureContext
}
declare function addCertificatesV1(
    params: ProxyAgentParams,
    addCertificatesV1: boolean,
    opts: http.RequestOptions,
    callback: () => void
): void
export interface CertificateParams {
    log: Log
}
export declare function loadSystemCertificates(params: CertificateParams): Promise<string[]>
export declare function resetCaches(): void
export declare function toLogString(args: any[]): string
