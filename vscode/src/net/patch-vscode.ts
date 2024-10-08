// This patch file must have minimal dependencies and should be one of the first
// imports to ensure it correctly patches the network stack.
import type * as http from 'node:http'
import type * as https from 'node:https'
import { globalAgentRef } from '@sourcegraph/cody-shared/src/fetch.patch'
import { env as vscode_env } from 'vscode'
import type * as internalVSCodeAgent from './vscode-network-proxy'

export const proxyIdentifierSybmol = Symbol('proxyIdentifier')

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
    // const mod = Object.keys(require.cache)?.find(v => v.endsWith('@vscode/proxy-agent/out/agent.js'))
    // _PacProxyAgent = mod ? (require.cache[mod] as any)?.exports?.PacProxyAgent : null
    //TODO: has the module so we can log changes in versions for future

    //TODO: We might need to fallback to previous _VSCODE_NODE_MODULES hack for older versions?
    // const _IMPORT_NODE_MODULES = '_VSCODE_NODE_MODULES'
    // const _IMPORT_PROXY_AGENT_PATH = '@vscode/proxy-agent/out/agent'
    // const _IMPORT_PAC_PROXY_AGENT = 'PacProxyAgent'

    if (!_PacProxyAgent) {
        // WE don't handle this yet, we rely on the fact that Sourcegraph
        // HTTP Client and Completions client explicitly set agent.current
        // as their agent (which will be respected if PacProxy is not
        // interfering)
        return
    }

    const _http = require('node:http')
    const _https = require('node:https')
    mergeModules(_http, patchVSCodeModule(_http))
    mergeModules(_https, patchVSCodeModule(_https))

    const originalConnect = _PacProxyAgent.prototype.connect
    _PacProxyAgent.prototype.connect = async function (req: any, opts: any): Promise<any> {
        if (!(proxyIdentifierSybmol in opts._codyAgent)) {
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
            if (proxyIdentifierSybmol in options.agent) {
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
