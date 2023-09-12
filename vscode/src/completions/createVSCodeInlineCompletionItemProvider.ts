import * as vscode from 'vscode'

import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { FeatureFlag, FeatureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'

import { ContextProvider } from '../chat/ContextProvider'
import { logDebug } from '../log'
import type { AuthProvider } from '../services/AuthProvider'
import { CodyStatusBar } from '../services/StatusBar'

import { CodeCompletionsClient } from './client'
import { GraphSectionObserver } from './context/graph-section-observer'
import { VSCodeDocumentHistory } from './context/history'
import { createProviderConfig } from './providers/createProvider'
import { registerAutocompleteTraceView } from './tracer/traceView'
import { InlineCompletionItemProvider } from './vscodeInlineCompletionItemProvider'

interface InlineCompletionItemProviderArgs {
    config: Configuration
    client: CodeCompletionsClient
    statusBar: CodyStatusBar
    contextProvider: ContextProvider
    featureFlagProvider: FeatureFlagProvider
    authProvider: AuthProvider
}

export async function createInlineCompletionItemProvider({
    config,
    client,
    statusBar,
    contextProvider,
    featureFlagProvider,
    authProvider,
}: InlineCompletionItemProviderArgs): Promise<vscode.Disposable> {
    if (!authProvider.getAuthStatus().isLoggedIn) {
        logDebug('CodyCompletionProvider:notSignedIn', 'You are not signed in.')

        return {
            dispose: () => {},
        }
    }

    const disposables: vscode.Disposable[] = []

    const providerConfig = await createProviderConfig(config, client, featureFlagProvider)
    if (providerConfig) {
        const graphContextFlag = await featureFlagProvider?.evaluateFeatureFlag(
            FeatureFlag.CodyAutocompleteGraphContext
        )

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
            isEmbeddingsContextEnabled: config.autocompleteAdvancedEmbeddings,
            graphContextFetcher: sectionObserver,
            completeSuggestWidgetSelection: config.autocompleteExperimentalCompleteSuggestWidgetSelection,
            featureFlagProvider,
        })

        disposables.push(
            vscode.commands.registerCommand('cody.autocomplete.inline.accepted', ({ codyLogId, codyCompletion }) => {
                completionsProvider.handleDidAcceptCompletionItem(codyLogId, codyCompletion)
            }),
            vscode.languages.registerInlineCompletionItemProvider('*', completionsProvider),
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
