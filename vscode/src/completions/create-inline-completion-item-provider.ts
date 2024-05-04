import * as vscode from 'vscode'

import {
    type CodeCompletionsClient,
    type ConfigurationWithAccessToken,
    featureFlagProvider,
    isDotCom,
} from '@sourcegraph/cody-shared'

import { logDebug } from '../log'
import type { AuthProvider } from '../services/AuthProvider'
import type { CodyStatusBar } from '../services/StatusBar'

import { completionProviderConfig } from './completion-provider-config'
import type { BfgRetriever } from './context/retrievers/bfg/bfg-retriever'
import { InlineCompletionItemProvider } from './inline-completion-item-provider'
import { createProviderConfig } from './providers/create-provider'
import { registerAutocompleteTraceView } from './tracer/traceView'
import { createProviderConfigForModel } from './providers/create-provider'

interface InlineCompletionItemProviderArgs {
    config: ConfigurationWithAccessToken
    client: CodeCompletionsClient
    statusBar: CodyStatusBar
    authProvider: AuthProvider
    triggerNotice: ((notice: { key: string }) => void) | null
    createBfgRetriever?: () => BfgRetriever
}

/**
 * Inline completion item providers that always returns an empty reply.
 * Implemented as a class instead of anonymous function so that you can identify
 * it with `console.log()` debugging.
 */
class NoopCompletionItemProvider implements vscode.InlineCompletionItemProvider {
    public provideInlineCompletionItems(
        _document: vscode.TextDocument,
        _position: vscode.Position,
        _context: vscode.InlineCompletionContext,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
        return { items: [] }
    }
}

export async function triggerMultiModelAutocompletionsForComparison(allProviders: InlineCompletionItemProvider[]) {
    const activeEditor = vscode.window.activeTextEditor
    if (!activeEditor) {
        return
    }
    const document = activeEditor.document;
    const position = activeEditor.selection.active;
    const context = {
        triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
        selectedCompletionInfo: undefined
    }
    const allPromises: Promise<string>[] = []
    for (const provider of allProviders) {
        allPromises.push(provider.manuallyGetCompletionItemsForProvider(
            document,
            position,
            context
        ))
    }
    const results = await Promise.all(allPromises);
    const allResults = results.join('\n');
    logDebug('MultiModelAutoComplete:\n', allResults);
}


export async function createInlineCompletionItemFromMultipleProviders({
    config,
    client,
    statusBar,
    authProvider,
    triggerNotice,
    createBfgRetriever,
}: InlineCompletionItemProviderArgs) {
    // Creates multiple providers to get completions from.
    // The primary purpose of this method is to get the completions generated from multiple providers,
    // which helps judge the quality of code completions
    const authStatus = authProvider.getAuthStatus()
    if (!authStatus.isLoggedIn) {
        return {
            dispose: () => {},
        }
    }

    const disposables: vscode.Disposable[] = []
    const allProviderConfigs = [
        {
            'provider': 'fireworks',
            'model': 'starcoder-hybrid',
        },
        {
            'provider': 'fireworks',
            'model': 'fireworks-completions-fine-tuned',
        },
        {
            'provider': 'anthropic',
            'model': 'claude-3-haiku-20240307',
        }
    ]
    const allProviders: InlineCompletionItemProvider[] = []
    for (const curretProviderConfig of allProviderConfigs) {
        const providerConfig = await createProviderConfigForModel(
            client,
            authStatus,
            curretProviderConfig['model'],
            curretProviderConfig['provider'],
            config
        )
        if(providerConfig) {
            const authStatus = authProvider.getAuthStatus()
            const completionsProvider = new InlineCompletionItemProvider({
                authStatus,
                providerConfig,
                statusBar,
                completeSuggestWidgetSelection: config.autocompleteCompleteSuggestWidgetSelection,
                formatOnAccept: config.autocompleteFormatOnAccept,
                disableInsideComments: config.autocompleteDisableInsideComments,
                triggerNotice,
                isRunningInsideAgent: config.isRunningInsideAgent,
                createBfgRetriever,
                isDotComUser: isDotCom(authStatus.endpoint || ''),
                isRequestForMultipleModelCompletions: true,
            })
            allProviders.push(completionsProvider)
        }
    }
    disposables.push(
        vscode.commands.registerCommand('cody.multi-model-autocomplete.manual-trigger', () =>
            triggerMultiModelAutocompletionsForComparison(allProviders)
        )
    )

    return {
        dispose: () => {
            for (const disposable of disposables) {
                disposable.dispose()
            }
        },
    }
}

export async function createInlineCompletionItemProvider({
    config,
    client,
    statusBar,
    authProvider,
    triggerNotice,
    createBfgRetriever,
}: InlineCompletionItemProviderArgs): Promise<vscode.Disposable> {
    const authStatus = authProvider.getAuthStatus()
    if (!authStatus.isLoggedIn) {
        logDebug('CodyCompletionProvider:notSignedIn', 'You are not signed in.')

        if (config.isRunningInsideAgent) {
            // Register an empty completion provider when running inside the
            // agent to avoid timeouts because it awaits for an
            // `InlineCompletionItemProvider` to be registered.
            return vscode.languages.registerInlineCompletionItemProvider(
                '*',
                new NoopCompletionItemProvider()
            )
        }

        return {
            dispose: () => {},
        }
    }

    const disposables: vscode.Disposable[] = []

    const [providerConfig] = await Promise.all([
        createProviderConfig(config, client, authStatus),
        completionProviderConfig.init(config, featureFlagProvider),
    ])

    if (providerConfig) {
        const authStatus = authProvider.getAuthStatus()
        const completionsProvider = new InlineCompletionItemProvider({
            authStatus,
            providerConfig,
            statusBar,
            completeSuggestWidgetSelection: config.autocompleteCompleteSuggestWidgetSelection,
            formatOnAccept: config.autocompleteFormatOnAccept,
            disableInsideComments: config.autocompleteDisableInsideComments,
            triggerNotice,
            isRunningInsideAgent: config.isRunningInsideAgent,
            createBfgRetriever,
            isDotComUser: isDotCom(authStatus.endpoint || ''),
        })

        const documentFilters = await getInlineCompletionItemProviderFilters(
            config.autocompleteLanguages
        )

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
            `Can't register completion provider because \`providerConfig\` evaluated to \`null\`. To fix this problem, debug why createProviderConfig returned null instead of ProviderConfig. To further debug this problem, here is the configuration:\n${JSON.stringify(
                config,
                null,
                2
            )}`
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
