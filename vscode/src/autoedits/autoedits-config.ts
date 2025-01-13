import * as vscode from 'vscode'

import {
    type AutoEditsModelConfig,
    type AutoEditsTokenLimit,
    authStatus,
    isDotComAuthed,
} from '@sourcegraph/cody-shared'

import { RetrieverIdentifier } from '../completions/context/utils'
import { getConfiguration } from '../configuration'

interface BaseAutoeditsProviderConfig {
    provider: AutoEditsModelConfig['provider']
    model: string
    url: string
    tokenLimit: AutoEditsTokenLimit
    isChatModel: boolean
}

export interface AutoeditsProviderConfig extends BaseAutoeditsProviderConfig {
    experimentalAutoeditsConfigOverride: AutoEditsModelConfig | undefined
    isMockResponseFromCurrentDocumentTemplateEnabled: boolean
}

const defaultTokenLimit = {
    prefixTokens: 2500,
    suffixTokens: 2500,
    maxPrefixLinesInArea: 11,
    maxSuffixLinesInArea: 4,
    codeToRewritePrefixLines: 1,
    codeToRewriteSuffixLines: 2,
    contextSpecificTokenLimit: {
        [RetrieverIdentifier.RecentEditsRetriever]: 1500,
        [RetrieverIdentifier.JaccardSimilarityRetriever]: 0,
        [RetrieverIdentifier.RecentCopyRetriever]: 500,
        [RetrieverIdentifier.DiagnosticsRetriever]: 500,
        [RetrieverIdentifier.RecentViewPortRetriever]: 2500,
    },
} as const satisfies AutoEditsTokenLimit

/**
 * Retrieves the base configuration for the AutoEdits provider based on authentication status.
 */
function getBaseProviderConfig(): BaseAutoeditsProviderConfig {
    if (isDotComAuthed()) {
        return {
            provider: 'cody-gateway',
            model: 'autoedits-deepseek-lite-default',
            url: 'https://cody-gateway.sourcegraph.com/v1/completions/fireworks',
            tokenLimit: defaultTokenLimit,
            isChatModel: false,
        }
    }

    return {
        provider: 'sourcegraph',
        model: 'fireworks::v1::autoedits-deepseek-lite-default',
        tokenLimit: defaultTokenLimit,
        url: '',
        isChatModel: false,
    }
}

/**
 * Retrieves the configuration for the AutoEdits provider by combining user settings with default values.
 */
export function getAutoeditsProviderConfig(): AutoeditsProviderConfig {
    const isMockResponseFromCurrentDocumentTemplateEnabled = vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.experimental.autoedit.use-mock-responses', false)

    const userConfig = getConfiguration().experimentalAutoEditConfigOverride
    const baseConfig = userConfig ?? getBaseProviderConfig()

    return {
        experimentalAutoeditsConfigOverride: userConfig,
        isMockResponseFromCurrentDocumentTemplateEnabled,
        provider: baseConfig.provider,
        model: baseConfig.model,
        url: baseConfig.url ?? '',
        tokenLimit: baseConfig.tokenLimit,
        isChatModel: baseConfig.isChatModel,
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
