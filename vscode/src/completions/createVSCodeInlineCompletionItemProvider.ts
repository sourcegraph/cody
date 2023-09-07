import * as vscode from 'vscode'

import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { FeatureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'

import { ContextProvider } from '../chat/ContextProvider'
import { CodyStatusBar } from '../services/StatusBar'

import { CodeCompletionsClient } from './client'
import { VSCodeDocumentHistory } from './context/history'
import { createProviderConfig } from './providers/createProvider'
import { registerAutocompleteTraceView } from './tracer/traceView'
import { InlineCompletionItemProvider } from './vscodeInlineCompletionItemProvider'

export async function createInlineCompletionItemProvider(
    config: Configuration,
    client: CodeCompletionsClient,
    statusBar: CodyStatusBar,
    contextProvider: ContextProvider,
    featureFlagProvider: FeatureFlagProvider
): Promise<vscode.Disposable> {
    const disposables: vscode.Disposable[] = []

    const providerConfig = await createProviderConfig(config, client, featureFlagProvider)
    if (providerConfig) {
        const history = new VSCodeDocumentHistory()
        const completionsProvider = new InlineCompletionItemProvider({
            providerConfig,
            history,
            statusBar,
            getCodebaseContext: () => contextProvider.context,
            isEmbeddingsContextEnabled: config.autocompleteAdvancedEmbeddings,
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
