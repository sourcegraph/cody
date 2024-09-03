import * as vscode from 'vscode'

import {
    type ClientConfiguration,
    type ClientConfigurationWithAccessToken,
    type CodyIDE,
    type ConfigurationUseContext,
    DOTCOM_URL,
    OLLAMA_DEFAULT_URL,
    PromptString,
    ps,
} from '@sourcegraph/cody-shared'

import { URI } from 'vscode-uri'
import {
    CONFIG_KEY,
    type ConfigKeys,
    type ConfigurationKeysMap,
    getConfigEnumValues,
} from './configuration-keys'
import { localStorage } from './services/LocalStorageProvider'
import { getAccessToken } from './services/SecretStorageProvider'

interface ConfigGetter {
    get<T>(section: (typeof CONFIG_KEY)[ConfigKeys], defaultValue?: T): T
}

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

    let autocompleteAdvancedProvider = config.get<
        | ClientConfiguration['autocompleteAdvancedProvider']
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

    const autocompleteExperimentalGraphContext: 'lsp-light' | 'bfg' | null = getHiddenSetting(
        'autocomplete.experimental.graphContext',
        null
    )

    function hasValidLocalEmbeddingsConfig(): boolean {
        return (
            [
                'testing.localEmbeddings.model',
                'testing.localEmbeddings.endpoint',
                'testing.localEmbeddings.indexLibraryPath',
            ].every(key => !!getHiddenSetting<string | undefined>(key, undefined)) &&
            !!getHiddenSetting<number | undefined>('testing.localEmbeddings.dimension', undefined)
        )
    }
    const vsCodeConfig = vscode.workspace.getConfiguration()

    return {
        proxy: vsCodeConfig.get<string>('http.proxy'),
        codebase: sanitizeCodebase(config.get(CONFIG_KEY.codebase)),
        customHeaders: config.get<object>(CONFIG_KEY.customHeaders, {}) as Record<string, string>,
        useContext: config.get<ConfigurationUseContext>(CONFIG_KEY.useContext) || 'embeddings',
        debugVerbose: config.get<boolean>(CONFIG_KEY.debugVerbose, false),
        debugFilter: debugRegex,
        telemetryLevel: config.get<'all' | 'off'>(CONFIG_KEY.telemetryLevel, 'all'),
        autocomplete: config.get(CONFIG_KEY.autocompleteEnabled, true),
        autocompleteLanguages: config.get(CONFIG_KEY.autocompleteLanguages, {
            '*': true,
        }),
        chatPreInstruction: PromptString.fromConfig(config, CONFIG_KEY.chatPreInstruction, ps``),
        editPreInstruction: PromptString.fromConfig(config, CONFIG_KEY.editPreInstruction, ps``),
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
        internalDebugContext: getHiddenSetting('internal.debug.context', false),

        autocompleteExperimentalGraphContext,
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
        autocompleteExperimentalMultiModelCompletions: getHiddenSetting(
            'autocomplete.experimental.multiModelCompletions',
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

        telemetryClientName: getHiddenSetting<string | undefined>('telemetry.clientName'),
        testingModelConfig:
            isTesting && hasValidLocalEmbeddingsConfig()
                ? {
                      model: getHiddenSetting<string>('testing.localEmbeddings.model'),
                      dimension: getHiddenSetting<number>('testing.localEmbeddings.dimension'),
                      endpoint: getHiddenSetting<string>('testing.localEmbeddings.endpoint'),
                      indexPath: URI.file(
                          getHiddenSetting<string>('testing.localEmbeddings.indexLibraryPath')
                      ),
                      provider: 'sourcegraph',
                  }
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

export function getConfigWithEndpoint(): Omit<ClientConfigurationWithAccessToken, 'accessToken'> {
    const config = getConfiguration()
    const isTesting = process.env.CODY_TESTING === 'true'
    const serverEndpoint =
        localStorage?.getEndpoint() || (isTesting ? 'http://localhost:49300/' : DOTCOM_URL.href)
    return { ...config, serverEndpoint }
}

export const getFullConfig = async (): Promise<ClientConfigurationWithAccessToken> => {
    const accessToken =
        vscode.workspace.getConfiguration().get<string>('cody.accessToken') ||
        (await getAccessToken()) ||
        null
    return { ...getConfigWithEndpoint(), accessToken }
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
