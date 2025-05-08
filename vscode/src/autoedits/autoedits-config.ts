import * as vscode from 'vscode'

import {
    type AutoEditsModelConfig,
    type AutoEditsTokenLimit,
    FeatureFlag,
    authStatus,
    featureFlagProvider,
    isDotComAuthed,
} from '@sourcegraph/cody-shared'

import { RetrieverIdentifier } from '../completions/context/utils'
import { getConfiguration } from '../configuration'
import { isHotStreakEnabledInSettings } from './hot-streak/utils'

interface BaseAutoeditsProviderConfig {
    provider: AutoEditsModelConfig['provider']
    promptProvider?: AutoEditsModelConfig['promptProvider']
    model: string
    url: string
    tokenLimit: AutoEditsTokenLimit
    isChatModel: boolean
    timeoutMs: number
}

export interface AutoeditsProviderConfig extends BaseAutoeditsProviderConfig {
    experimentalAutoeditsConfigOverride: AutoEditsModelConfig | undefined
    isMockResponseFromCurrentDocumentTemplateEnabled: boolean
}

export const defaultTokenLimit: AutoEditsTokenLimit = {
    prefixTokens: 500,
    suffixTokens: 500,
    maxPrefixLinesInArea: 11,
    maxSuffixLinesInArea: 4,
    codeToRewritePrefixLines: 1,
    codeToRewriteSuffixLines: 2,
    contextSpecificTokenLimit: {
        [RetrieverIdentifier.RecentEditsRetriever]: 1500,
        [RetrieverIdentifier.JaccardSimilarityRetriever]: 0,
        [RetrieverIdentifier.RecentCopyRetriever]: 500,
        [RetrieverIdentifier.DiagnosticsRetriever]: 250,
        [RetrieverIdentifier.RecentViewPortRetriever]: 1000,
    },
    contextSpecificNumItemsLimit: {
        [RetrieverIdentifier.RecentEditsRetriever]: 10,
        [RetrieverIdentifier.JaccardSimilarityRetriever]: 0,
        [RetrieverIdentifier.RecentCopyRetriever]: 0,
        [RetrieverIdentifier.DiagnosticsRetriever]: 2,
        [RetrieverIdentifier.RecentViewPortRetriever]: 2,
    },
} as const satisfies AutoEditsTokenLimit

export const hotStreakTokenLimit: AutoEditsTokenLimit = {
    ...defaultTokenLimit,
    codeToRewritePrefixLines: 4,
    codeToRewriteSuffixLines: 24,
    contextSpecificTokenLimit: {
        [RetrieverIdentifier.RecentEditsRetriever]: 1000,
        [RetrieverIdentifier.JaccardSimilarityRetriever]: 0,
        [RetrieverIdentifier.RecentCopyRetriever]: 0,
        [RetrieverIdentifier.DiagnosticsRetriever]: 100,
        [RetrieverIdentifier.RecentViewPortRetriever]: 500,
    },
    contextSpecificNumItemsLimit: {
        [RetrieverIdentifier.RecentEditsRetriever]: 10,
        [RetrieverIdentifier.JaccardSimilarityRetriever]: 0,
        [RetrieverIdentifier.RecentCopyRetriever]: 0,
        [RetrieverIdentifier.DiagnosticsRetriever]: 2,
        [RetrieverIdentifier.RecentViewPortRetriever]: 2,
    },
} as const satisfies AutoEditsTokenLimit

let hotStreakEnabled = false
featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutoEditHotStreak).subscribe(value => {
    hotStreakEnabled = value
    autoeditsProviderConfig = getAutoeditsProviderConfig()
})

/**
 * Determines if hot streak mode should be enabled based on feature flag and settings.
 */
export function isHotStreakEnabled(): boolean {
    return hotStreakEnabled || isHotStreakEnabledInSettings()
}

/**
 * Configuration models for different authentication states and modes.
 */
type ConfigModels = {
    dotcom: string
    sgInstance: string
}

/**
 * Configuration options shared between different provider modes.
 */
interface ProviderModeConfig {
    tokenLimit: AutoEditsTokenLimit
    promptProvider: AutoEditsModelConfig['promptProvider']
    models: ConfigModels
}

/**
 * Configuration map for different provider modes.
 */
const providerModes: Record<'standard' | 'hotStreak', ProviderModeConfig> = {
    standard: {
        tokenLimit: defaultTokenLimit,
        promptProvider: undefined,
        models: {
            dotcom: 'autoedits-deepseek-lite-default',
            sgInstance: 'fireworks::v1::autoedits-deepseek-lite-default',
        },
    },
    hotStreak: {
        tokenLimit: hotStreakTokenLimit,
        promptProvider: 'long-suggestion-prompt-provider',
        models: {
            dotcom: 'autoedits-long-suggestion-default',
            sgInstance: 'fireworks::v1::autoedits-long-suggestion-default',
        },
    },
}

/**
 * Provider configurations based on authentication state.
 */
const providerConfigs: Record<
    'dotCom' | 'sgInstance',
    Omit<BaseAutoeditsProviderConfig, 'model' | 'tokenLimit' | 'promptProvider'>
> = {
    dotCom: {
        provider: 'cody-gateway',
        url: 'https://cody-gateway.sourcegraph.com/v1/completions/fireworks',
        isChatModel: false,
        timeoutMs: 10_000,
    },
    sgInstance: {
        provider: 'sourcegraph',
        url: '',
        isChatModel: false,
        timeoutMs: 10_000,
    },
}

/**
 * Retrieves the base configuration for the AutoEdits provider based on authentication status.
 */
function getBaseProviderConfig(): BaseAutoeditsProviderConfig {
    const mode = isHotStreakEnabled() ? 'hotStreak' : 'standard'
    const config = providerModes[mode]
    const authConfig = isDotComAuthed() ? providerConfigs.dotCom : providerConfigs.sgInstance

    return {
        ...authConfig,
        promptProvider: config.promptProvider,
        tokenLimit: config.tokenLimit,
        model: isDotComAuthed() ? config.models.dotcom : config.models.sgInstance,
    }
}

/**
 * Retrieves the configuration for the AutoEdits provider by combining user settings with default values.
 */
function getAutoeditsProviderConfig(): AutoeditsProviderConfig {
    const isMockResponseFromCurrentDocumentTemplateEnabled = vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.experimental.autoedit.use-mock-responses', false)

    const userConfig = getConfiguration().experimentalAutoEditConfigOverride
    const baseConfig = userConfig ?? getBaseProviderConfig()

    return {
        experimentalAutoeditsConfigOverride: userConfig,
        isMockResponseFromCurrentDocumentTemplateEnabled,
        provider: baseConfig.provider,
        promptProvider: baseConfig.promptProvider,
        model: baseConfig.model,
        url: baseConfig.url ?? '',
        tokenLimit: baseConfig.tokenLimit,
        isChatModel: baseConfig.isChatModel,
        timeoutMs: baseConfig.timeoutMs,
    }
}

/**
 * A singleton for the static autoedits provider config.
 */
export let autoeditsProviderConfig = getAutoeditsProviderConfig()

// Recompute autoedits config on auth status change.
authStatus.subscribe(() => {
    autoeditsProviderConfig = getAutoeditsProviderConfig()
})
