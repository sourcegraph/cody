import * as vscode from 'vscode'

import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'

import { ContextProvider } from '../chat/ContextProvider'
import { PlatformContext } from '../extension.common'
import { logDebug } from '../log'
import { gitDirectoryUri } from '../repository/repositoryHelpers'
import type { AuthProvider } from '../services/AuthProvider'
import { CodyStatusBar } from '../services/StatusBar'

import { CodeCompletionsClient } from './client'
import { GraphContextFetcher } from './context/context-graph'
import { VSCodeDocumentHistory } from './context/history'
import { LspLightGraphCache } from './context/lsp-light-graph-cache'
import { InlineCompletionItemProvider } from './inline-completion-item-provider'
import { createProviderConfig } from './providers/createProvider'
import { registerAutocompleteTraceView } from './tracer/traceView'

interface InlineCompletionItemProviderArgs {
    config: Configuration
    client: CodeCompletionsClient
    statusBar: CodyStatusBar
    contextProvider: ContextProvider
    authProvider: AuthProvider
    triggerNotice: ((notice: { key: string }) => void) | null
}

export async function createInlineCompletionItemProvider(
    { config, client, statusBar, contextProvider, authProvider, triggerNotice }: InlineCompletionItemProviderArgs,
    context: vscode.ExtensionContext,
    platform: Omit<PlatformContext, 'getRgPath'>
): Promise<vscode.Disposable> {
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
        featureFlagProvider?.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteGraphContextBfg),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteDisableNetworkCache),
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteDisableRecyclingOfPreviousRequests),
    ])
    if (providerConfig) {
        const history = new VSCodeDocumentHistory()
        const graphContextFetcher: GraphContextFetcher | undefined =
            config.autocompleteExperimentalGraphContext === 'lsp-light' || lspGraphContextFlag
                ? LspLightGraphCache.createInstance()
                : config.autocompleteExperimentalGraphContext === 'bfg' || bfgGraphContextFlag
                ? platform.createBfgContextFetcher?.(context, gitDirectoryUri)
                : undefined

        const completionsProvider = new InlineCompletionItemProvider({
            providerConfig,
            history,
            statusBar,
            getCodebaseContext: () => contextProvider.context,
            graphContextFetcher,
            completeSuggestWidgetSelection: config.autocompleteCompleteSuggestWidgetSelection,
            disableNetworkCache,
            disableRecyclingOfPreviousRequests,
            triggerNotice,
            isRunningInsideAgent: config.isRunningInsideAgent,
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
            registerAutocompleteTraceView(completionsProvider)
        )
        if (graphContextFetcher) {
            disposables.push(graphContextFetcher)
        }
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
