import * as vscode from 'vscode'

import type {
    Configuration,
    ConfigurationUseContext,
    ConfigurationWithAccessToken,
} from '@sourcegraph/cody-shared/src/configuration'
import { DOTCOM_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'

import { CONFIG_KEY, ConfigKeys } from './configuration-keys'
import { LocalStorage } from './services/LocalStorageProvider'
import { getAccessToken, SecretStorage } from './services/SecretStorageProvider'

interface ConfigGetter {
    get<T>(section: (typeof CONFIG_KEY)[ConfigKeys], defaultValue?: T): T
}

/**
 * All configuration values, with some sanitization performed.
 */
export function getConfiguration(config: ConfigGetter): Configuration {
    const isTesting = process.env.CODY_TESTING === 'true'

    let debugRegex: RegExp | null = null
    try {
        const debugPattern: string | null = config.get<string | null>(CONFIG_KEY.debugFilter, null)
        if (debugPattern) {
            if (debugPattern === '*') {
                debugRegex = new RegExp('.*')
            } else {
                debugRegex = new RegExp(debugPattern)
            }
        }
    } catch (error: any) {
        void vscode.window.showErrorMessage("Error parsing cody.debug.filter regex - using default '*'", error)
        debugRegex = new RegExp('.*')
    }

    return {
        // NOTE: serverEndpoint is now stored in Local Storage instead but we will still keep supporting the one in confg
        // to use as fallback for users who do not have access to local storage
        serverEndpoint: sanitizeServerEndpoint(config.get(CONFIG_KEY.serverEndpoint, '')),
        codebase: sanitizeCodebase(config.get(CONFIG_KEY.codebase)),
        customHeaders: config.get<object>(CONFIG_KEY.customHeaders, {}) as Record<string, string>,
        useContext: config.get<ConfigurationUseContext>(CONFIG_KEY.useContext) || 'embeddings',
        debugEnable: config.get<boolean>(CONFIG_KEY.debugEnable, false),
        debugVerbose: config.get<boolean>(CONFIG_KEY.debugVerbose, false),
        debugFilter: debugRegex,
        telemetryLevel: config.get<'all' | 'off'>(CONFIG_KEY.telemetryLevel, 'all'),
        autocomplete: config.get(CONFIG_KEY.autocompleteEnabled, true),
        experimentalChatPredictions: config.get(CONFIG_KEY.experimentalChatPredictions, isTesting),
        inlineChat: config.get(CONFIG_KEY.inlineChatEnabled, true),
        experimentalGuardrails: config.get(CONFIG_KEY.experimentalGuardrails, isTesting),
        experimentalNonStop: config.get(CONFIG_KEY.experimentalNonStop, isTesting),
        experimentalLocalSymbols: config.get(CONFIG_KEY.experimentalLocalSymbols, false),
        experimentalCommandLenses: config.get(CONFIG_KEY.experimentalCommandLenses, false),
        experimentalEditorTitleCommandIcon: config.get(CONFIG_KEY.experimentalEditorTitleCommandIcon, false),
        autocompleteAdvancedProvider: config.get(CONFIG_KEY.autocompleteAdvancedProvider, null),
        experimentalSymfPath: config.get<string>(CONFIG_KEY.experimentalSymfPath, 'symf'),
        experimentalSymfAnthropicKey: config.get<string>(CONFIG_KEY.experimentalSymfAnthropicKey, ''),
        autocompleteAdvancedServerEndpoint: config.get<string | null>(
            CONFIG_KEY.autocompleteAdvancedServerEndpoint,
            null
        ),
        autocompleteAdvancedModel: config.get<string | null>(CONFIG_KEY.autocompleteAdvancedModel, null),
        autocompleteAdvancedAccessToken: config.get<string | null>(CONFIG_KEY.autocompleteAdvancedAccessToken, null),
        autocompleteAdvancedEmbeddings: config.get(CONFIG_KEY.autocompleteAdvancedEmbeddings, true),
        autocompleteExperimentalCompleteSuggestWidgetSelection: config.get(
            CONFIG_KEY.autocompleteExperimentalCompleteSuggestWidgetSelection,
            false
        ),
        pluginsEnabled: config.get<boolean>(CONFIG_KEY.pluginsEnabled, false),
        pluginsDebugEnabled: config.get<boolean>(CONFIG_KEY.pluginsDebugEnabled, true),
        pluginsConfig: config.get(CONFIG_KEY.pluginsConfig, {}),

        // Note: In spirit, we try to minimize agent-specific code paths in the VSC extension.
        // We currently use this flag for the agent to provide more helpful error messages
        // when something goes wrong, and to suppress event logging in the agent.
        // Rely on this flag sparingly.
        isRunningInsideAgent: config.get('cody.advanced.agent.running' as any, false),
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

function sanitizeServerEndpoint(serverEndpoint: string): string {
    if (!serverEndpoint) {
        // TODO(philipp-spiess): Find out why the config is not loaded properly in the integration
        // tests.
        const isTesting = process.env.CODY_TESTING === 'true'
        if (isTesting) {
            return 'http://localhost:49300/'
        }

        return DOTCOM_URL.href
    }
    const trailingSlashRegexp = /\/$/
    return serverEndpoint.trim().replace(trailingSlashRegexp, '')
}

const codyConfiguration = vscode.workspace.getConfiguration('cody')

// Update user configurations in VS Code for Cody
export async function updateConfiguration(configKey: string, configValue: string): Promise<void> {
    await codyConfiguration.update(configKey, configValue, vscode.ConfigurationTarget.Global)
}

export const getFullConfig = async (
    secretStorage: SecretStorage,
    localStorage?: LocalStorage
): Promise<ConfigurationWithAccessToken> => {
    const config = getConfiguration(vscode.workspace.getConfiguration())
    // Migrate endpoints to local storage
    config.serverEndpoint = localStorage?.getEndpoint() || config.serverEndpoint
    const accessToken = (await getAccessToken(secretStorage)) || null
    return { ...config, accessToken }
}
