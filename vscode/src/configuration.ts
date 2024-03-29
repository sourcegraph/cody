import * as vscode from 'vscode'

import {
    type Configuration,
    type ConfigurationUseContext,
    type ConfigurationWithAccessToken,
    DOTCOM_URL,
    OLLAMA_DEFAULT_URL,
} from '@sourcegraph/cody-shared'

import {
    CONFIG_KEY,
    type ConfigKeys,
    type ConfigurationKeysMap,
    getConfigEnumValues,
} from './configuration-keys'
import { localStorage } from './services/LocalStorageProvider'
import { type SecretStorage, getAccessToken } from './services/SecretStorageProvider'

interface ConfigGetter {
    get<T>(section: (typeof CONFIG_KEY)[ConfigKeys], defaultValue?: T): T
}

/**
 * All configuration values, with some sanitization performed.
 */
export function getConfiguration(
    config: ConfigGetter = vscode.workspace.getConfiguration()
): Configuration {
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

    let autocompleteAdvancedProvider = config.get<
        | Configuration['autocompleteAdvancedProvider']
        | 'unstable-ollama'
        | 'unstable-fireworks'
        | 'experimental-openaicompatible'
    >(CONFIG_KEY.autocompleteAdvancedProvider, null)

    // Handle deprecated provider identifiers
    switch (autocompleteAdvancedProvider) {
        case 'unstable-fireworks':
            autocompleteAdvancedProvider = 'fireworks'
            break
        case 'unstable-ollama':
            autocompleteAdvancedProvider = 'experimental-ollama'
            break
    }

    // check if the configured enum values are valid
    const configKeys = [
        'autocompleteAdvancedProvider',
        'autocompleteAdvancedModel',
    ] as (keyof ConfigurationKeysMap)[]

    for (const configVal of configKeys) {
        const key = configVal.replaceAll(/([A-Z])/g, '.$1').toLowerCase()
        const value: string | null = config.get(CONFIG_KEY[configVal])
        checkValidEnumValues(key, value)
    }

    const autocompleteExperimentalGraphContext: 'bfg' | null = getHiddenSetting(
        'autocomplete.experimental.graphContext',
        null
    )

    return {
        proxy: config.get<string | null>(CONFIG_KEY.proxy, null),
        codebase: sanitizeCodebase(config.get(CONFIG_KEY.codebase)),
        customHeaders: config.get<object>(CONFIG_KEY.customHeaders, {}) as Record<string, string>,
        useContext: config.get<ConfigurationUseContext>(CONFIG_KEY.useContext) || 'embeddings',
        debugEnable: config.get<boolean>(CONFIG_KEY.debugEnable, true),
        debugVerbose: config.get<boolean>(CONFIG_KEY.debugVerbose, false),
        debugFilter: debugRegex,
        telemetryLevel: config.get<'all' | 'off'>(CONFIG_KEY.telemetryLevel, 'all'),
        autocomplete: config.get(CONFIG_KEY.autocompleteEnabled, true),
        autocompleteLanguages: config.get(CONFIG_KEY.autocompleteLanguages, {
            '*': true,
        }),
        chatPreInstruction: config.get(CONFIG_KEY.chatPreInstruction, ''),
        editPreInstruction: config.get(CONFIG_KEY.editPreInstruction, ''),
        commandCodeLenses: config.get(CONFIG_KEY.commandCodeLenses, false),
        autocompleteAdvancedProvider,
        autocompleteAdvancedModel: config.get<string | null>(CONFIG_KEY.autocompleteAdvancedModel, null),
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

        autocompleteExperimentalGraphContext,
        experimentalSimpleChatContext: getHiddenSetting('experimental.simpleChatContext', true),
        experimentalSymfContext: getHiddenSetting('experimental.symfContext', true),

        experimentalGuardrails: getHiddenSetting('experimental.guardrails', isTesting),
        experimentalTracing: getHiddenSetting('experimental.tracing', false),

        experimentalOllamaChat: getHiddenSetting('experimental.ollamaChat', false),
        experimentalSupercompletions: getHiddenSetting('experimental.supercompletions', false),

        experimentalChatContextRanker: getHiddenSetting('experimental.chatContextRanker', false),

        autocompleteExperimentalHotStreak: getHiddenSetting(
            'autocomplete.experimental.hotStreak',
            false
        ),
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
        autocompleteExperimentalSmartThrottle: getHiddenSetting(
            'autocomplete.experimental.smartThrottle',
            false
        ),

        // Note: In spirit, we try to minimize agent-specific code paths in the VSC extension.
        // We currently use this flag for the agent to provide more helpful error messages
        // when something goes wrong, and to suppress event logging in the agent.
        // Rely on this flag sparingly.
        isRunningInsideAgent: getHiddenSetting('advanced.agent.running', false),
        agentIDE: getHiddenSetting<'VSCode' | 'JetBrains' | 'Neovim' | 'Emacs'>('advanced.agent.ide'),
        autocompleteTimeouts: {
            multiline: getHiddenSetting<number | undefined>(
                'autocomplete.advanced.timeout.multiline',
                undefined
            ),
            singleline: getHiddenSetting<number | undefined>(
                'autocomplete.advanced.timeout.singleline',
                undefined
            ),
        },

        testingLocalEmbeddingsModel: isTesting
            ? getHiddenSetting<string | undefined>('testing.localEmbeddings.model', undefined)
            : undefined,
        testingLocalEmbeddingsEndpoint: isTesting
            ? getHiddenSetting<string | undefined>('testing.localEmbeddings.endpoint', undefined)
            : undefined,
        testingLocalEmbeddingsIndexLibraryPath: isTesting
            ? getHiddenSetting<string | undefined>('testing.localEmbeddings.indexLibraryPath', undefined)
            : undefined,
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

export async function getFullConfig(
    secretStorage: SecretStorage
): Promise<ConfigurationWithAccessToken> {
    const config = getConfiguration()
    const isTesting = process.env.CODY_TESTING === 'true'
    const serverEndpoint =
        localStorage?.getEndpoint() || (isTesting ? 'http://localhost:49300/' : DOTCOM_URL.href)
    const accessToken = (await getAccessToken(secretStorage)) || null
    return { ...config, accessToken, serverEndpoint }
}

function checkValidEnumValues(configName: string, value: string | null): void {
    const validEnumValues = getConfigEnumValues(`cody.${configName}`)
    if (value) {
        if (!validEnumValues.includes(value)) {
            void vscode.window.showErrorMessage(
                `Invalid value for ${configName}: ${value}. Valid values are: ${validEnumValues.join(
                    ', '
                )}`
            )
        }
    }
}
