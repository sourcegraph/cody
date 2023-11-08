import * as vscode from 'vscode'

import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'

import type { BfgRetriever } from '../graph/bfg/BfgContextFetcher'
import { logDebug } from '../log'
import type { AuthProvider } from '../services/AuthProvider'
import { CodyStatusBar } from '../services/StatusBar'

import { CodeCompletionsClient } from './client'
import { InlineCompletionItemProvider } from './inline-completion-item-provider'
import { createProviderConfig } from './providers/createProvider'
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
        lspGraphContextFlag,
        bfgGraphContextFlag,
        disableNetworkCache,
        disableRecyclingOfPreviousRequests,
    ] = await Promise.all([
        createProviderConfig(config, client, authProvider.getAuthStatus().configOverwrites),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteGraphContext),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteGraphContextBfg),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteDisableNetworkCache),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteDisableRecyclingOfPreviousRequests),
    ])
    if (providerConfig) {
        const contextStrategy =
            config.autocompleteExperimentalGraphContext === 'lsp-light'
                ? 'lsp-light'
                : config.autocompleteExperimentalGraphContext === 'bfg'
                ? 'bfg'
                : lspGraphContextFlag
                ? 'lsp-light'
                : bfgGraphContextFlag
                ? 'bfg'
                : 'jaccard-similarity'

        const completionsProvider = new InlineCompletionItemProvider({
            providerConfig,
            statusBar,
            completeSuggestWidgetSelection: config.autocompleteCompleteSuggestWidgetSelection,
            disableNetworkCache,
            disableRecyclingOfPreviousRequests,
            triggerNotice,
            isRunningInsideAgent: config.isRunningInsideAgent,
            contextStrategy,
            createBfgRetriever,
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

export async function getInlineCompletionItemProviderFilters(
    autocompleteLanguages: Record<string, boolean>
): Promise<vscode.DocumentFilter[]> {
    const { '*': isEnabledForAll, ...perLanguageConfig } = autocompleteLanguages
    const languageIds = await vscode.languages.getLanguages()

    return languageIds.flatMap(language => {
        const enabled = language in perLanguageConfig ? perLanguageConfig[language] : isEnabledForAll

        return enabled ? [{ language, scheme: 'file' }] : []
    })
}
