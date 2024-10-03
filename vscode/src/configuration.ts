import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as vscode from 'vscode'

import {
    type ClientConfiguration,
    type CodyIDE,
    OLLAMA_DEFAULT_URL,
    type PickResolvedConfiguration,
    PromptString,
    setStaticResolvedConfigurationValue,
} from '@sourcegraph/cody-shared'

import type { ChatModelProviderConfig } from '@sourcegraph/cody-shared/src/models/sync'
import { CONFIG_KEY, type ConfigKeys } from './configuration-keys'
import { localStorage } from './services/LocalStorageProvider'

interface ConfigGetter {
    get<T>(section: (typeof CONFIG_KEY)[ConfigKeys], defaultValue?: T): T
}

let lastProxyConfig: {
    host?: string
    port?: number
    path?: string
    cacert?: string
} | null = null
let cachedProxyPath: string | undefined
let cachedProxyCACert: string | undefined

/**
 * All configuration values, with some sanitization performed.
 */
export function getConfiguration(
    config: ConfigGetter = vscode.workspace.getConfiguration()
): ClientConfiguration {
    const isTesting = process.env.CODY_TESTING === 'true'

    function getHiddenSetting<T>(configKey: string, defaultValue?: T): T {
        return config.get<T>(`cody.${configKey}` as any, defaultValue)
    }

    let debugRegex: RegExp | null = null
    try {
        const debugPattern: string | null = config.get<string | null>(CONFIG_KEY.debugFilter, null)
        if (debugPattern) {
            if (debugPattern === '*') {
                debugRegex = /.*/
            } else {
                debugRegex = new RegExp(debugPattern)
            }
        }
    } catch (error: any) {
        void vscode.window.showErrorMessage(
            "Error parsing cody.debug.filter regex - using default '*'",
            error
        )
        debugRegex = /.*/
    }

    function resolveHomedir(filePath?: string): string | undefined {
        for (const homeDir of ['~/', '%USERPROFILE%\\']) {
            if (filePath?.startsWith(homeDir)) {
                return `${os.homedir()}${path.sep}${filePath.slice(homeDir.length)}`
            }
        }
        return filePath
    }

    function readProxyPath(filePath: string | undefined): string | undefined {
        if (filePath !== lastProxyConfig?.path) {
            const path = resolveHomedir(filePath)
            cachedProxyPath = undefined
            if (path) {
                try {
                    if (!fs.statSync(path).isSocket()) {
                        throw new Error('Not a socket')
                    }
                    fs.accessSync(path, fs.constants.R_OK | fs.constants.W_OK)
                    cachedProxyPath = path
                } catch (error) {
                    // `logError` caused repeated calls of this code
                    console.error(`Cannot verify ${CONFIG_KEY.proxy}.path: ${path}: ${error}`)
                    void vscode.window.showErrorMessage(
                        `Cannot verify ${CONFIG_KEY.proxy}.path: ${path}:\n${error}`
                    )
                }
            }
        }
        return cachedProxyPath
    }

    function readProxyCACert(filePath: string | undefined): string | undefined {
        if (filePath !== lastProxyConfig?.cacert) {
            const path = resolveHomedir(filePath)
            cachedProxyCACert = undefined
            if (path) {
                // support directly embedding a CA cert in the settings
                if (path.startsWith('-----BEGIN CERTIFICATE-----')) {
                    cachedProxyCACert = path
                } else {
                    try {
                        cachedProxyCACert = fs.readFileSync(path, { encoding: 'utf-8' })
                    } catch (error) {
                        // `logError` caused repeated calls of this code
                        console.error(`Cannot read ${CONFIG_KEY.proxy}.cacert: ${path}:\n${error}`)
                        void vscode.window.showErrorMessage(
                            `Error reading ${CONFIG_KEY.proxy}.cacert from ${path}:\n${error}`
                        )
                    }
                }
            }
        }
        return cachedProxyCACert
    }

    const vsCodeConfig = vscode.workspace.getConfiguration()

    const proxyConfig = config.get<{
        host?: string
        port?: number
        path?: string
        cacert?: string
    } | null>(CONFIG_KEY.proxy, null)

    let proxyHost = proxyConfig?.host
    let proxyPort = proxyConfig?.port

    if (
        (lastProxyConfig?.host !== proxyHost || lastProxyConfig?.port !== proxyPort) &&
        ((proxyHost && !proxyPort) || (!proxyHost && proxyPort))
    ) {
        // `logError` caused repeated calls of this code
        console.error(`${CONFIG_KEY.proxy}.host and ${CONFIG_KEY.proxy}.port must be set together`)
        void vscode.window.showErrorMessage(
            `${CONFIG_KEY.proxy}.host and ${CONFIG_KEY.proxy}.port must be set together`
        )
        proxyHost = undefined
        proxyPort = undefined
    }

    const proxyPath = readProxyPath(proxyConfig?.path)
    const proxyCACert = readProxyCACert(proxyConfig?.cacert)

    lastProxyConfig = proxyConfig

    return {
        proxy: vsCodeConfig.get<string>('http.proxy'),
        proxyHost: proxyHost,
        proxyPort: proxyPort,
        proxyPath: proxyPath,
        proxyCACert: proxyCACert,
        codebase: sanitizeCodebase(config.get(CONFIG_KEY.codebase)),
        serverEndpoint: config.get<string>(CONFIG_KEY.serverEndpoint),
        customHeaders: config.get<Record<string, string>>(CONFIG_KEY.customHeaders),
        debugVerbose: config.get<boolean>(CONFIG_KEY.debugVerbose, false),
        debugFilter: debugRegex,
        telemetryLevel: config.get<'all' | 'off'>(CONFIG_KEY.telemetryLevel, 'all'),
        autocomplete: config.get(CONFIG_KEY.autocompleteEnabled, true),
        autocompleteLanguages: config.get(CONFIG_KEY.autocompleteLanguages, {
            '*': true,
        }),
        chatPreInstruction: PromptString.fromConfig(config, CONFIG_KEY.chatPreInstruction, undefined),
        editPreInstruction: PromptString.fromConfig(config, CONFIG_KEY.editPreInstruction, undefined),
        commandCodeLenses: config.get(CONFIG_KEY.commandCodeLenses, false),
        autocompleteAdvancedProvider: config.get<ClientConfiguration['autocompleteAdvancedProvider']>(
            CONFIG_KEY.autocompleteAdvancedProvider,
            'default'
        ),
        autocompleteCompleteSuggestWidgetSelection: config.get(
            CONFIG_KEY.autocompleteCompleteSuggestWidgetSelection,
            true
        ),
        autocompleteFormatOnAccept: config.get(CONFIG_KEY.autocompleteFormatOnAccept, true),
        autocompleteDisableInsideComments: config.get(
            CONFIG_KEY.autocompleteDisableInsideComments,
            false
        ),
        codeActions: config.get(CONFIG_KEY.codeActionsEnabled, true),
        commandHints: config.get(CONFIG_KEY.commandHintsEnabled, false),

        /**
         * Hidden settings for internal use only.
         */

        internalUnstable: getHiddenSetting('internal.unstable', isTesting),
        internalDebugContext: getHiddenSetting('internal.debug.context', false),
        internalDebugState: getHiddenSetting('internal.debug.state', false),

        autocompleteAdvancedModel: getHiddenSetting('autocomplete.advanced.model', null),
        autocompleteExperimentalGraphContext: getHiddenSetting<
            ClientConfiguration['autocompleteExperimentalGraphContext']
        >('autocomplete.experimental.graphContext', null),
        experimentalCommitMessage: getHiddenSetting('experimental.commitMessage', true),
        experimentalNoodle: getHiddenSetting('experimental.noodle', false),

        experimentalTracing: getHiddenSetting('experimental.tracing', false),

        experimentalSupercompletions: getHiddenSetting('experimental.supercompletions', false),
        experimentalMinionAnthropicKey: getHiddenSetting('experimental.minion.anthropicKey', undefined),

        experimentalGuardrailsTimeoutSeconds: getHiddenSetting('experimental.guardrailsTimeoutSeconds'),

        autocompleteExperimentalOllamaOptions: getHiddenSetting(
            'autocomplete.experimental.ollamaOptions',
            {
                url: OLLAMA_DEFAULT_URL,
                model: 'codellama:7b-code',
            }
        ),
        autocompleteExperimentalFireworksOptions: getHiddenSetting(
            'autocomplete.experimental.fireworksOptions',
            undefined
        ),
        autocompleteExperimentalPreloadDebounceInterval: getHiddenSetting(
            'autocomplete.experimental.preloadDebounceInterval',
            0
        ),

        // Note: In spirit, we try to minimize agent-specific code paths in the VSC extension.
        // We currently use this flag for the agent to provide more helpful error messages
        // when something goes wrong, and to suppress event logging in the agent.
        // Rely on this flag sparingly.
        isRunningInsideAgent: getHiddenSetting('advanced.agent.running', false),
        hasNativeWebview: getHiddenSetting('advanced.hasNativeWebview', true),
        agentIDE: getHiddenSetting<CodyIDE>('advanced.agent.ide'),
        agentIDEVersion: getHiddenSetting('advanced.agent.ide.version'),
        agentExtensionVersion: getHiddenSetting('advanced.agent.extension.version'),
        agentHasPersistentStorage: getHiddenSetting('advanced.agent.capabilities.storage', false),
        autocompleteFirstCompletionTimeout: getHiddenSetting<number>(
            'autocomplete.advanced.timeout.firstCompletion',
            3_500
        ),
        providerLimitPrompt: getHiddenSetting<number | undefined>('provider.limit.prompt', undefined),
        devModels: getHiddenSetting<ChatModelProviderConfig[] | undefined>('dev.models', undefined),

        telemetryClientName: getHiddenSetting<string | undefined>('telemetry.clientName'),

        /**
         * Overrides always take precedence over other configuration. Specific
         * override flags should be preferred over opaque blanket settings /
         * environment variables such as TESTING_MODE which can make it
         * difficult to understand the broad impact such a setting can have.
         */
        overrideAuthToken: getHiddenSetting<string | undefined>('override.authToken'),
        overrideServerEndpoint: getHiddenSetting<string | undefined>('override.serverEndpoint'),
    }
}

function sanitizeCodebase(codebase: string | undefined): string {
    if (!codebase) {
        return ''
    }
    const protocolRegexp = /^(https?):\/\//
    const trailingSlashRegexp = /\/$/
    return codebase.replace(protocolRegexp, '').trim().replace(trailingSlashRegexp, '')
}

/**
 * Set the global {@link resolvedConfig} value with the given {@link AuthCredentials} and otherwise
 * use global config and client state.
 *
 * Call this only when this value is guaranteed not to change during execution (such as in CLI
 * programs).
 */
export function setStaticResolvedConfigurationWithAuthCredentials({
    configuration,
    auth,
}: PickResolvedConfiguration<{ configuration: 'customHeaders'; auth: true }>): void {
    setStaticResolvedConfigurationValue({
        configuration: { ...getConfiguration(), customHeaders: configuration.customHeaders },
        auth,
        clientState: localStorage.getClientState(),
        isReinstall: false,
    })
}
