// 🚨 This patch file must have NO additional dependencies as import order
// changes might cause modules to load before the networking is patched.
import EventEmitter from 'node:events'
import type * as http from 'node:http'
import type * as https from 'node:https'
import { type NetEventMap, globalAgentRef } from '@sourcegraph/cody-shared/src/fetch.patch'
import type * as internalVSCodeAgent from './vscode-network-proxy'

// This should be a function that returns true/false wether this agent wants to
// bypass vscode
export const bypassVSCodeSymbol = Symbol('bypassVSCodeSymbol')
let patched = false
patchNetworkStack()

function patchNetworkStack(): void {
    if (patched) {
        return
    }
    patched = true

    // First we check if the module has been poisoned (e.g. something is
    // importing http/https before us and thus wouldn't receive our patch)
    const poisonedModule = new Error('http/https was already imported before we could patch')
    try {
        if (require.cache[require.resolve('http')] !== undefined) {
            throw poisonedModule
        }
        if (require.cache[require.resolve('https')] !== undefined) {
            throw poisonedModule
        }
    } catch (e) {
        if (e !== poisonedModule) {
            throw e
        }
        // ignore everything else
    }

    const _PacProxyAgent = requireInternalVSCodeAgent()?.PacProxyAgent

    const _http = require('node:http')
    const _https = require('node:https')
    if (_PacProxyAgent) {
        mergeModules(_http, patchVSCodeModule('http', _http, _PacProxyAgent))
        mergeModules(_https, patchVSCodeModule('https', _https, _PacProxyAgent))
    } else {
        mergeModules(_http, patchNodeModule('http', _http))
        mergeModules(_https, patchNodeModule('https', _https))
    }
}

function mergeModules(module: any, patch: any) {
    return Object.assign(module.default || module, patch)
}

function patchNodeModule(
    originalModuleName: 'http' | 'https',
    originalModule: typeof http | typeof https
) {
    const netEvents = new EventEmitter<NetEventMap>()
    globalAgentRef.netEvents = netEvents

    function patch(
        originalFn: typeof http.get | typeof https.get | typeof http.request | typeof https.request
    ) {
        const patchedFn: typeof originalFn = (...args: any) => {
            let [url, options, _] = args
            if (typeof url !== 'string' && !(url && (<any>url).searchParams)) {
                _ = <any>options
                options = url
                url = null
            }
            if (typeof options === 'function') {
                _ = options
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

            const agent = options?.agent
                ? bypassVSCodeSymbol in options.agent
                    ? 'delegating-agent'
                    : 'other'
                : null
            const req = originalFn.apply(originalFn, args) as ReturnType<typeof originalFn>
            netEvents?.emit('request', {
                req: req,
                protocol: originalModuleName,
                agent,
                options,
                url: url ?? options?.href,
            })
            return req
        }
        return patchedFn
    }
    return { get: patch(originalModule.get), request: patch(originalModule.request) }
}

function patchVSCodeModule(
    originalModuleName: 'http' | 'https',
    originalModule: typeof http | typeof https,
    vscodeAgentClass: new () => internalVSCodeAgent.PacProxyAgent
) {
    const netEvents = new EventEmitter<NetEventMap>()
    globalAgentRef.netEvents = netEvents

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
            if (!options.agent || !(bypassVSCodeSymbol in options.agent)) {
                return originalFn.apply(originalFn, args as any)
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
            options._vscode = {
                // we should add some helpers here that agents can call into vscode's cert loading
            }
            let handler: 'vscode' | 'delegating-agent' = 'vscode'

            if (options.agent[bypassVSCodeSymbol]()) {
                handler = 'delegating-agent'
                // this means this agent wants to bypass VSCode. We do this
                // by ensuring this agent is seen as a PacProxyAgent.
                options.agent = new Proxy(options.agent, {
                    getPrototypeOf(target) {
                        return vscodeAgentClass.prototype
                    },
                })
            }
            const req = originalFn(options, callback)
            netEvents?.emit('request', {
                req: req,
                url: url ?? options?.href,
                options,
                protocol: originalModuleName,
                agent: handler,
            })
            return req
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
    const { env: vscode_env } = require('vscode')
    // import { env as vscode_env } from 'vscode'
    const appRoot = vscode_env.appRoot
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
