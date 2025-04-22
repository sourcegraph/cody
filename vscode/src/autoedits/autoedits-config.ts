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

const defaultTokenLimit = {
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
} as const satisfies AutoEditsTokenLimit

let hotStreakEnabled = false
featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutoEditHotStreak).subscribe(value => {
    hotStreakEnabled = value
    autoeditsProviderConfig = getAutoeditsProviderConfig()
})

/**
 * Retrieves the base configuration for the AutoEdits provider based on authentication status.
 */
function getBaseProviderConfig(): BaseAutoeditsProviderConfig {
    const shouldHotStreak = hotStreakEnabled || isHotStreakEnabledInSettings()
    const tokenLimit = shouldHotStreak
        ? // Hot-streak can handle much longer suffixes
          { ...defaultTokenLimit, codeToRewriteSuffixLines: 30 }
        : defaultTokenLimit
    const promptProvider: AutoEditsModelConfig['promptProvider'] = shouldHotStreak
        ? 'long-suggestion-prompt-provider'
        : undefined

    // Common configuration for both authentication states
    const baseConfig = {
        promptProvider,
        tokenLimit,
        isChatModel: false,
        timeoutMs: 10_000,
    } as const

    if (isDotComAuthed()) {
        return {
            ...baseConfig,
            provider: 'cody-gateway',
            model: shouldHotStreak
                ? 'autoedits-long-suggestion-default'
                : 'autoedits-deepseek-lite-default',
            url: 'https://cody-gateway.sourcegraph.com/v1/completions/fireworks',
        }
    }

    return {
        ...baseConfig,
        provider: 'sourcegraph',
        model: shouldHotStreak
            ? 'fireworks::v1::autoedits-long-suggestion-default'
            : 'fireworks::v1::autoedits-deepseek-lite-default',
        url: '',
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
