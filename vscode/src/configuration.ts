import * as vscode from 'vscode'

import {
    type ClientConfiguration,
    type CodyIDE,
    type ConfigurationUseContext,
    OLLAMA_DEFAULT_URL,
    type PickResolvedConfiguration,
    PromptString,
    ps,
    setStaticResolvedConfigurationValue,
} from '@sourcegraph/cody-shared'

import type { ChatModelProviderConfig } from '@sourcegraph/cody-shared/src/models/sync'
import { URI } from 'vscode-uri'
import { CONFIG_KEY, type ConfigKeys } from './configuration-keys'
import { localStorage } from './services/LocalStorageProvider'

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
        serverEndpoint: config.get<string>(CONFIG_KEY.serverEndpoint, 'https://sourcegraph.com'),
        customHeaders: config.get<Record<string, string>>(CONFIG_KEY.customHeaders),
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
    })
}
