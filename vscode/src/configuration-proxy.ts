import * as fs from 'node:fs'
import https from 'node:https'
import * as os from 'node:os'
import * as path from 'node:path'
import { parse as parseUrl } from 'node:url'
import { agent } from '@sourcegraph/cody-shared'
import type { AuthCredentials, ClientConfiguration, ClientState } from '@sourcegraph/cody-shared'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { ProxyAgent } from 'proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import * as vscode from 'vscode'
import type * as vscode from 'vscode'
// @ts-ignore
import { registerLocalCertificates } from './certs'
import { setCustomAgent } from './fetch.node'

import {
    type ClientConfiguration,
    type ResolvedConfiguration,
    distinctUntilChanged,
    logError,
    resolvedConfig,
} from '@sourcegraph/cody-shared'

import { CONFIG_KEY } from './configuration-keys'

import { type Observable, map } from 'observable-fns'

export async function intializeConfigurationProxy(
    config: Observable<Pick<ClientConfiguration, 'proxy' | 'proxyServer' | 'proxyPath' | 'proxyCACert'>>
) {
    // 1. Attempt to load initial proxy settings / ca certs etc
    //    1.1 set up config change listener to update agent = {current, _forceCodyProxy}
    // 2. regardless of success resolve promise
}

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

function getAgentFactory({
    proxy,
    proxyServer,
    proxyPath,
    proxyCACert,
}: ClientConfiguration): ({ protocol }: Pick<URL, 'protocol'>) => http.Agent {
    return ({ protocol }) => {
        if (proxyServer || proxyPath) {
            const [proxyHost, proxyPort] = proxyServer ? proxyServer.split(':') : [undefined, undefined]

            // Combine the CA certs from the global options with the one(s) defined in settings,
            // otherwise the CA cert in the settings overrides all of the global agent options
            // (or the other way around, depending on the order of the options).
            const caCerts = (() => {
                if (proxyCACert) {
                    if (Array.isArray(https.globalAgent.options.ca)) {
                        return [...https.globalAgent.options.ca, proxyCACert]
                    }
                    return [https.globalAgent.options.ca, proxyCACert]
                }
                return undefined
            })()
            const agent = new ProxyAgent({
                protocol: protocol || 'https:',
                ...(proxyServer ? { host: proxyHost, port: Number(proxyPort) } : null),
                ...(proxyPath ? { socketPath: proxyPath } : null),
                keepAlive: true,
                keepAliveMsecs: 60000,
                ...https.globalAgent.options,
                // Being at the end, this will override https.globalAgent.options.ca
                ...(caCerts ? { ca: caCerts } : null),
            })
            return agent
        }

        const proxyURL = proxy || getGlobalProxyURI(protocol, process.env)
        if (proxyURL) {
            if (proxyURL?.startsWith('socks')) {
                if (!socksProxyAgent) {
                    socksProxyAgent = new SocksProxyAgent(proxyURL, {
                        keepAlive: true,
                        keepAliveMsecs: 60000,
                    })
                }
                return socksProxyAgent
            }
            const proxyEndpoint = parseUrl(proxyURL)

            const opts = {
                host: proxyEndpoint.hostname || '',
                port:
                    (proxyEndpoint.port ? +proxyEndpoint.port : 0) ||
                    (proxyEndpoint.protocol === 'https' ? 443 : 80),
                auth: proxyEndpoint.auth,
                rejectUnauthorized: true,
                keepAlive: true,
                keepAliveMsecs: 60000,
                ...https.globalAgent.options,
            }
            if (protocol === 'http:') {
                if (!httpProxyAgent) {
                    httpProxyAgent = new HttpProxyAgent(proxyURL, opts)
                }
                return httpProxyAgent
            }

            if (!httpsProxyAgent) {
                httpsProxyAgent = new HttpsProxyAgent(proxyURL, opts)
            }
            return httpsProxyAgent
        }
        return protocol === 'http:' ? httpAgent : httpsAgent
    }
}

// subscribe to proxy settings changes in order to validate them and refresh the agent if needed
export const proxySettings: Observable<ClientConfiguration> = resolvedConfig.pipe(
    // pluck(resolvedConfig, [CONFIG_KEY.proxy, CONFIG_KEY.proxyServer, CONFIG_KEY.proxyPath, CONFIG_KEY.proxyCACert]),
    map(validateProxySettings),
    distinctUntilChanged((prev, curr) => {
        return (
            prev.proxy === curr.proxy &&
            prev.proxyServer === curr.proxyServer &&
            prev.proxyPath === curr.proxyPath &&
            prev.proxyCACert === curr.proxyCACert
        )
    })
)

// set up the subscription here instead of in main.ts => start() because adding it to main.ts
// introduced fetch.node.ts as a dependency, which pulled in transitive dependencies that are not
// available for browser builds, which breaks the "_build:esbuild:web" target.
// We handled a similar issue with the Search extension by using package resolution in a build script,
// but there's no build script here and `esbuild --alias` doesn't like `./` prefixes, so it can't map
// `./fetch.node` to a stub/shim module.
proxySettings.subscribe(setCustomAgent)

let cachedProxyPath: string | undefined
let cachedProxyCACertPath: string | null | undefined
let cachedProxyCACert: string | undefined

export function validateProxySettings(config: ResolvedConfiguration): ClientConfiguration {
    const resolvedProxyPath = resolveHomedir(config.configuration.proxyPath)
    const resolvedProxyCACert = resolveHomedir(config.configuration.proxyCACert)
    if (resolvedProxyPath !== cachedProxyPath) {
        cachedProxyPath = validateProxyPath(resolvedProxyPath)
    }
    if (resolvedProxyCACert !== cachedProxyCACertPath) {
        cachedProxyCACert = readProxyCACert(resolvedProxyCACert)
        cachedProxyCACertPath = config.configuration.proxyCACert
    }

    return {
        ...config.configuration,
        proxyPath: cachedProxyPath,
        proxyCACert: cachedProxyCACert,
    }
}
function validateProxyPath(filePath: string | null | undefined): string | undefined {
    if (filePath) {
        try {
            if (!fs.statSync(filePath).isSocket()) {
                throw new Error('Not a socket')
            }
            fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK)
            return filePath
        } catch (error) {
            logError(
                'vscode.configuration',
                `Cannot verify ${CONFIG_KEY.proxy}.path: ${filePath}: ${error}`
            )
            void vscode.window.showErrorMessage(
                `Cannot verify ${CONFIG_KEY.proxy}.path: ${filePath}:\n${error}`
            )
        }
    }
    return undefined
}

export function readProxyCACert(filePath: string | null | undefined): string | undefined {
    if (filePath === cachedProxyCACertPath) {
        return cachedProxyCACert
    }
    if (filePath) {
        // support directly embedding a CA cert in the settings
        if (filePath.startsWith('-----BEGIN CERTIFICATE-----')) {
            return filePath
        }
        try {
            return fs.readFileSync(filePath, { encoding: 'utf-8' })
        } catch (error) {
            logError(
                'vscode.configuration',
                `Cannot read ${CONFIG_KEY.proxy}.cacert: ${filePath}: ${error}`
            )
            void vscode.window.showErrorMessage(
                `Error reading ${CONFIG_KEY.proxy}.cacert from ${filePath}:\n${error}`
            )
        }
    }
    return undefined
}

function resolveHomedir(filePath: string | null | undefined): string | undefined {
    for (const homeDir of ['~/', '%USERPROFILE%\\']) {
        if (filePath?.startsWith(homeDir)) {
            return `${os.homedir()}${path.sep}${filePath.slice(homeDir.length)}`
        }
    }
    return filePath ? filePath : undefined
}
