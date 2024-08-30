import { type MultimodelSingleModelConfig, isDotCom } from '@sourcegraph/cody-shared'
import _ from 'lodash'
import * as vscode from 'vscode'
import { logDebug } from '../log'
import { authProvider } from '../services/AuthProvider'
import type { InlineCompletionItemProviderArgs } from './create-inline-completion-item-provider'
import type { MultiModelCompletionsResults } from './inline-completion-item-provider'
import { InlineCompletionItemProvider } from './inline-completion-item-provider'
import { createProviderConfigHelper } from './providers/create-provider'

interface providerConfig {
    providerName: string
    modelName: string
    completionsProvider: InlineCompletionItemProvider
}

async function manuallyGetCompletionItemsForProvider(
    completionsProviderConfig: providerConfig,
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext
): Promise<MultiModelCompletionsResults> {
    const result = await completionsProviderConfig.completionsProvider.provideInlineCompletionItems(
        document,
        position,
        context,
        new vscode.CancellationTokenSource().token
    )
    const model = completionsProviderConfig.modelName
    const provider = completionsProviderConfig.providerName
    const completion = result?.items[0].insertText?.toString() || ''
    return {
        provider,
        model,
        completion,
    }
}

async function triggerMultiModelAutocompletionsForComparison(
    allCompletionsProvidersConfig: providerConfig[]
) {
    const activeEditor = vscode.window.activeTextEditor
    if (!activeEditor) {
        return
    }
    const document = activeEditor.document
    const position = activeEditor.selection.active
    const context = {
        triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
        selectedCompletionInfo: undefined,
    }
    const allPromises: Promise<MultiModelCompletionsResults>[] = []
    for (const completionsProviderConfig of allCompletionsProvidersConfig) {
        allPromises.push(
            manuallyGetCompletionItemsForProvider(completionsProviderConfig, document, position, context)
        )
    }
    const completions = await Promise.all(allPromises)
    let completionsOutput = ''
    for (const result of completions) {
        completionsOutput += `Model: ${result.model}\n${result.completion}\n\n`
    }
    logDebug('MultiModelAutoComplete:\n', completionsOutput)
}

export async function createInlineCompletionItemFromMultipleProviders({
    config,
    client,
    statusBar,
    createBfgRetriever,
}: InlineCompletionItemProviderArgs): Promise<vscode.Disposable> {
    // Creates multiple providers to get completions from.
    // The primary purpose of this method is to get the completions generated from multiple providers,
    // which helps judge the quality of code completions
    const authStatus = authProvider.instance!.getAuthStatus()
    if (!authStatus.isLoggedIn || config.autocompleteExperimentalMultiModelCompletions === undefined) {
        return {
            dispose: () => {},
        }
    }

    const disposables: vscode.Disposable[] = []

    const multiModelConfigsList: MultimodelSingleModelConfig[] = []
    for (const currentProviderConfig of config.autocompleteExperimentalMultiModelCompletions) {
        if (currentProviderConfig.provider && currentProviderConfig.model) {
            multiModelConfigsList.push({
                provider: currentProviderConfig.provider,
                model: currentProviderConfig.model,
                enableExperimentalFireworksOverrides:
                    currentProviderConfig.enableExperimentalFireworksOverrides ?? false,
            })
        }
    }

    if (multiModelConfigsList.length === 0) {
        return {
            dispose: () => {},
        }
    }

    const allPromises = multiModelConfigsList.map(async currentProviderConfig => {
        const newConfig = _.cloneDeep(config)
        // Override some config to ensure we are not logging extra events.
        newConfig.telemetryLevel = 'off'
        // We should only override the fireworks "cody.autocomplete.experimental.fireworksOptions" when added in the config.
        newConfig.autocompleteExperimentalFireworksOptions =
            currentProviderConfig.enableExperimentalFireworksOverrides
                ? config.autocompleteExperimentalFireworksOptions
                : undefined
        // Don't use the advanced provider config to get the model
        newConfig.autocompleteAdvancedModel = null

        const providerConfig = await createProviderConfigHelper({
            client,
            authStatus,
            modelId: currentProviderConfig.model,
            provider: currentProviderConfig.provider,
            config: newConfig,
        })
        if (providerConfig) {
            const authStatus = authProvider.instance!.getAuthStatus()
            const completionsProvider = new InlineCompletionItemProvider({
                authStatus,
                providerConfig,
                firstCompletionTimeout: config.autocompleteFirstCompletionTimeout,
                statusBar,
                completeSuggestWidgetSelection: config.autocompleteCompleteSuggestWidgetSelection,
                formatOnAccept: config.autocompleteFormatOnAccept,
                disableInsideComments: config.autocompleteDisableInsideComments,
                isRunningInsideAgent: config.isRunningInsideAgent,
                createBfgRetriever,
                isDotComUser: isDotCom(authStatus.endpoint || ''),
                noInlineAccept: true,
            })
            return {
                providerName: currentProviderConfig.provider,
                modelName: currentProviderConfig.model,
                completionsProvider: completionsProvider,
            }
        }
        return undefined
    })
    const allProviders = await Promise.all(allPromises)
    const allCompletionsProviders: providerConfig[] = []
    for (const provider of allProviders) {
        if (provider) {
            allCompletionsProviders.push(provider)
        }
    }
    disposables.push(
        vscode.commands.registerCommand('cody.multi-model-autocomplete.manual-trigger', () =>
            triggerMultiModelAutocompletionsForComparison(allCompletionsProviders)
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
