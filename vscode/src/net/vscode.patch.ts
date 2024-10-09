// This patch file must have minimal dependencies and should be one of the first
// imports to ensure it correctly patches the network stack.
import type * as http from 'node:http'
import type * as https from 'node:https'
import { globalAgentRef } from '@sourcegraph/cody-shared/src/fetch.patch'
import { env as vscode_env } from 'vscode'
import type * as internalVSCodeAgent from './vscode-network-proxy'

// This should be a function that returns true/false wether this agent wants to
// bypass vscode
export const bypassVSCodeSymbol = Symbol('bypassVSCodeSymbol')

let patched = false
patchNetworkStack()
// This needs to happen after so that we don't break import order
globalAgentRef.blockEarlyAccess = true

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

    if (!_PacProxyAgent) {
        return
    }

    const _http = require('node:http')
    const _https = require('node:https')

    mergeModules(_http, patchVSCodeModule(_http, _PacProxyAgent))
    mergeModules(_https, patchVSCodeModule(_https, _PacProxyAgent))
}

function mergeModules(module: any, patch: any) {
    return Object.assign(module.default || module, patch)
}

function patchVSCodeModule(
    originalModule: typeof http | typeof https,
    vscodeAgentClass: new () => internalVSCodeAgent.PacProxyAgent
) {
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
            options._vscode = {
                // we should add some helpers here that agents can call into vscode's cert loading
            }
            if (options.agent && bypassVSCodeSymbol in options.agent) {
                if (options.agent[bypassVSCodeSymbol]()) {
                    // this means this agent wants to bypass VSCode. We do this
                    // by ensuring this agent is seen as a PacProxyAgent.
                    options.agent = new Proxy(options.agent, {
                        getPrototypeOf(target) {
                            return vscodeAgentClass.prototype
                        },
                    })
                }
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
