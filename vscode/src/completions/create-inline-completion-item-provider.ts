import * as vscode from 'vscode'

import { isDefined } from '@sourcegraph/cody-shared'
import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { FeatureFlag, FeatureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'

import { ContextProvider } from '../chat/ContextProvider'
import { logDebug } from '../log'
import type { AuthProvider } from '../services/AuthProvider'
import { CodyStatusBar } from '../services/StatusBar'

import { CodeCompletionsClient } from './client'
import { GraphSectionObserver } from './context/graph-section-observer'
import { VSCodeDocumentHistory } from './context/history'
import { InlineCompletionItemProvider } from './inline-completion-item-provider'
import { createProviderConfig } from './providers/createProvider'
import { registerAutocompleteTraceView } from './tracer/traceView'

interface InlineCompletionItemProviderArgs {
    config: Configuration
    client: CodeCompletionsClient
    statusBar: CodyStatusBar
    contextProvider: ContextProvider
    featureFlagProvider: FeatureFlagProvider
    authProvider: AuthProvider
    triggerNotice: ((notice: { key: string }) => void) | null
}

export async function createInlineCompletionItemProvider({
    config,
    client,
    statusBar,
    contextProvider,
    featureFlagProvider,
    authProvider,
    triggerNotice,
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

    const [providerConfig, graphContextFlag] = await Promise.all([
        createProviderConfig(config, client, featureFlagProvider, authProvider.getAuthStatus().configOverwrites),
        featureFlagProvider?.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteGraphContext),
    ])
    if (providerConfig) {
        const history = new VSCodeDocumentHistory()
        const sectionObserver =
            config.autocompleteExperimentalGraphContext || graphContextFlag
                ? GraphSectionObserver.createInstance()
                : undefined

        const completionsProvider = new InlineCompletionItemProvider({
            providerConfig,
            history,
            statusBar,
            getCodebaseContext: () => contextProvider.context,
            graphContextFetcher: sectionObserver,
            completeSuggestWidgetSelection: config.autocompleteCompleteSuggestWidgetSelection,
            featureFlagProvider,
            triggerNotice,
        })

        const documentFilters = await getInlineCompletionItemProviderFilters(config.autocompleteLanguages)

        disposables.push(
            vscode.commands.registerCommand('cody.autocomplete.manual-trigger', () =>
                completionsProvider.manuallyTriggerCompletion()
            ),
            vscode.commands.registerCommand(
                'cody.autocomplete.inline.accepted',
                ({ codyLogId, codyCompletion, codyRequest }) => {
                    completionsProvider.handleDidAcceptCompletionItem(codyLogId, codyCompletion, codyRequest)
                }
            ),
            vscode.languages.registerInlineCompletionItemProvider(
                [{ notebookType: '*' }, ...documentFilters],
                completionsProvider
            ),
            registerAutocompleteTraceView(completionsProvider)
        )
        if (sectionObserver) {
            disposables.push(sectionObserver)
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

    // Enable for every known langauge ID if it's not explicitly disabled in `perLanguageConfig`.
    if (isEnabledForAll) {
        const languageIds = await vscode.languages.getLanguages()

        return languageIds
            .map(language => {
                if (perLanguageConfig[language] === undefined || perLanguageConfig[language] === true) {
                    return { language, scheme: 'file' }
                }

                return null
            })
            .filter(isDefined)
    }

    // Enable only for explicitly enabled languages in `perLanguageConfig`.
    return Object.entries(perLanguageConfig)
        .map(([language, isEnabled]) => {
            if (isEnabled) {
                return { language, scheme: 'file' }
            }

            return null
        })
        .filter(isDefined)
}
