import * as vscode from 'vscode'

import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { isDotCom } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'

import { logDebug } from '../log'
import type { AuthProvider } from '../services/AuthProvider'
import { CodyStatusBar } from '../services/StatusBar'

import { CodeCompletionsClient } from './client'
import { ContextStrategy } from './context/context-strategy'
import type { BfgRetriever } from './context/retrievers/bfg/bfg-retriever'
import { InlineCompletionItemProvider } from './inline-completion-item-provider'
import { createProviderConfig } from './providers/create-provider'
import { registerAutocompleteTraceView } from './tracer/traceView'

interface InlineCompletionItemProviderArgs {
    config: Configuration
    client: CodeCompletionsClient
    statusBar: CodyStatusBar
    authProvider: AuthProvider
    triggerNotice: ((notice: { key: string }) => void) | null
    createBfgRetriever?: () => BfgRetriever
}

export async function createInlineCompletionItemProvider({
    config,
    client,
    statusBar,
    authProvider,
    triggerNotice,
    createBfgRetriever,
}: InlineCompletionItemProviderArgs): Promise<vscode.Disposable> {
    if (!authProvider.getAuthStatus().isLoggedIn) {
        logDebug('CodyCompletionProvider:notSignedIn', 'You are not signed in.')

        if (config.isRunningInsideAgent) {
            // Register an empty completion provider when running inside the
            // agent to avoid timeouts because it awaits for an
            // `InlineCompletionItemProvider` to be registered.
            return vscode.languages.registerInlineCompletionItemProvider('*', {
                provideInlineCompletionItems: () => Promise.resolve({ items: [] }),
            })
        }

        return {
            dispose: () => {},
        }
    }

    const disposables: vscode.Disposable[] = []

    const [
        providerConfig,
        lspLightContextFlag,
        bfgContextFlag,
        bfgMixedContextFlag,
        localMixedContextFlag,
        disableRecyclingOfPreviousRequests,
        dynamicMultilineCompletionsFlag,
        hotStreakFlag,
    ] = await Promise.all([
        createProviderConfig(config, client, authProvider.getAuthStatus().configOverwrites),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteContextLspLight),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteContextBfg),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteContextBfgMixed),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteContextLocalMixed),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteDisableRecyclingOfPreviousRequests),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteDynamicMultilineCompletions),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteHotStreak),
    ])
    if (providerConfig) {
        const contextStrategy: ContextStrategy =
            config.autocompleteExperimentalGraphContext === 'lsp-light'
                ? 'lsp-light'
                : config.autocompleteExperimentalGraphContext === 'bfg'
                ? 'bfg'
                : config.autocompleteExperimentalGraphContext === 'bfg-mixed'
                ? 'bfg-mixed'
                : config.autocompleteExperimentalGraphContext === 'local-mixed'
                ? 'local-mixed'
                : config.autocompleteExperimentalGraphContext === 'jaccard-similarity'
                ? 'jaccard-similarity'
                : lspLightContextFlag
                ? 'lsp-light'
                : bfgContextFlag
                ? 'bfg'
                : bfgMixedContextFlag
                ? 'bfg-mixed'
                : localMixedContextFlag
                ? 'local-mixed'
                : 'jaccard-similarity'

        const dynamicMultilineCompletions =
            config.autocompleteExperimentalDynamicMultilineCompletions || dynamicMultilineCompletionsFlag
        const hotStreak = config.autocompleteExperimentalHotStreak || hotStreakFlag

        const authStatus = authProvider.getAuthStatus()
        const completionsProvider = new InlineCompletionItemProvider({
            authStatus: authProvider.getAuthStatus(),
            providerConfig,
            statusBar,
            completeSuggestWidgetSelection: config.autocompleteCompleteSuggestWidgetSelection,
            formatOnAccept: config.autocompleteFormatOnAccept,
            disableRecyclingOfPreviousRequests,
            triggerNotice,
            isRunningInsideAgent: config.isRunningInsideAgent,
            contextStrategy,
            createBfgRetriever,
            dynamicMultilineCompletions,
            hotStreak,
            isDotComUser: isDotCom(authStatus.endpoint || ''),
        })

        const documentFilters = await getInlineCompletionItemProviderFilters(config.autocompleteLanguages)

        disposables.push(
            vscode.commands.registerCommand('cody.autocomplete.manual-trigger', () =>
                completionsProvider.manuallyTriggerCompletion()
            ),
            vscode.languages.registerInlineCompletionItemProvider(
                [{ notebookType: '*' }, ...documentFilters],
                completionsProvider
            ),
            registerAutocompleteTraceView(completionsProvider),
            completionsProvider
        )
    } else if (config.isRunningInsideAgent) {
        throw new Error(
            "Can't register completion provider because `providerConfig` evaluated to `null`. " +
                'To fix this problem, debug why createProviderConfig returned null instead of ProviderConfig. ' +
                'To further debug this problem, here is the configuration:\n' +
                JSON.stringify(config, null, 2)
        )
    }

    return {
        dispose: () => {
            for (const disposable of disposables) {
                disposable.dispose()
            }
        },
    }
}

// Languages which should be disabled, but they are not present in
// https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
// But they exist in the `vscode.languages.getLanguages()` return value.
//
// To avoid confusing users with unknown language IDs, we disable them here programmatically.
const DISABLED_LANGUAGES = new Set(['scminput'])

export async function getInlineCompletionItemProviderFilters(
    autocompleteLanguages: Record<string, boolean>
): Promise<vscode.DocumentFilter[]> {
    const { '*': isEnabledForAll, ...perLanguageConfig } = autocompleteLanguages
    const languageIds = await vscode.languages.getLanguages()

    return languageIds.flatMap(language => {
        const enabled =
            !DISABLED_LANGUAGES.has(language) && language in perLanguageConfig
                ? perLanguageConfig[language]
                : isEnabledForAll

        return enabled ? [{ language, scheme: 'file' }] : []
    })
}
