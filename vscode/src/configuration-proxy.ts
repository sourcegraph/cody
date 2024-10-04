import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as vscode from 'vscode'

import {
    type ClientConfiguration,
    type ResolvedConfiguration,
    distinctUntilChanged,
    logError,
    resolvedConfig,
} from '@sourcegraph/cody-shared'

import { CONFIG_KEY } from './configuration-keys'

import { type Observable, map } from 'observable-fns'

// subscribe to proxy settings changes in order to validate them and refresh the agent if needed
export const proxySettings: Observable<ClientConfiguration> = resolvedConfig.pipe(
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
