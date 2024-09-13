import { type MultimodelSingleModelConfig, currentAuthStatus, isDotCom } from '@sourcegraph/cody-shared'
import { cloneDeep } from 'lodash'
import * as vscode from 'vscode'
import { logDebug } from '../log'
import { completionProviderConfig } from './completion-provider-config'
import type { InlineCompletionItemProviderArgs } from './create-inline-completion-item-provider'
import { InlineCompletionItemProvider } from './inline-completion-item-provider'
import { createProviderHelper } from './providers/create-provider'

export interface MultiModelCompletionsResults {
    provider: string
    model: string
    contextStrategy: string
    completion?: string
}

interface providerConfig {
    providerName: string
    modelName: string
    contextStrategy: string
    completionsProvider: InlineCompletionItemProvider
}

async function manuallyGetCompletionItemsForProvider(
    config: providerConfig,
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext
): Promise<MultiModelCompletionsResults> {
    const result = await config.completionsProvider.provideInlineCompletionItems(
        document,
        position,
        context,
        new vscode.CancellationTokenSource().token
    )
    const completion = result?.items[0].insertText?.toString() || ''
    return {
        provider: config.providerName,
        model: config.modelName,
        contextStrategy: config.contextStrategy,
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
        completionsOutput += `Model: ${result.model}\t Context: ${result.contextStrategy} \n${result.completion}\n\n`
    }
    logDebug('MultiModelAutoComplete:\n', completionsOutput)
}

export async function createInlineCompletionItemFromMultipleProviders({
    config,
    statusBar,
    createBfgRetriever,
}: InlineCompletionItemProviderArgs): Promise<vscode.Disposable> {
    // Creates multiple providers to get completions from.
    // The primary purpose of this method is to get the completions generated from multiple providers,
    // which helps judge the quality of code completions
    const authStatus = currentAuthStatus()
    if (
        !authStatus.authenticated ||
        config.autocompleteExperimentalMultiModelCompletions === undefined
    ) {
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
                context: currentProviderConfig.context,
            })
        }
    }

    if (multiModelConfigsList.length === 0) {
        return {
            dispose: () => {},
        }
    }

    const allCompletionsProviders: providerConfig[] = []
    for (const currentProviderConfig of multiModelConfigsList) {
        const newConfig: typeof config = {
            ...cloneDeep(config),
            // Override some config to ensure we are not logging extra events.
            telemetryLevel: 'off',
            // We should only override the fireworks "cody.autocomplete.experimental.fireworksOptions" when added in the config.
            autocompleteExperimentalFireworksOptions:
                currentProviderConfig.enableExperimentalFireworksOverrides
                    ? config.autocompleteExperimentalFireworksOptions
                    : undefined,
            // Don't use the advanced provider config to get the model
            autocompleteAdvancedModel: null,
            autocompleteExperimentalGraphContext: currentProviderConfig.context as
                | 'lsp-light'
                | 'bfg'
                | 'bfg-mixed'
                | 'tsc'
                | 'tsc-mixed'
                | null,
        }

        // Use the experimental config to get the context provider
        completionProviderConfig.setConfig(newConfig)
        const provider = createProviderHelper({
            legacyModel: currentProviderConfig.model,
            provider: currentProviderConfig.provider,
            config: newConfig,
            source: 'local-editor-settings',
        })

        const triggerDelay = vscode.workspace
            .getConfiguration()
            .get<number>('cody.autocomplete.triggerDelay')

        if (provider) {
            const completionsProvider = new InlineCompletionItemProvider({
                provider,
                config: newConfig,
                triggerDelay: triggerDelay ?? 0,
                firstCompletionTimeout: config.autocompleteFirstCompletionTimeout,
                statusBar,
                completeSuggestWidgetSelection: config.autocompleteCompleteSuggestWidgetSelection,
                formatOnAccept: config.autocompleteFormatOnAccept,
                disableInsideComments: config.autocompleteDisableInsideComments,
                isRunningInsideAgent: config.isRunningInsideAgent,
                createBfgRetriever,
                isDotComUser: isDotCom(authStatus),
                noInlineAccept: true,
            })
            allCompletionsProviders.push({
                providerName: currentProviderConfig.provider,
                modelName: currentProviderConfig.model,
                completionsProvider: completionsProvider,
                contextStrategy: currentProviderConfig.context,
            })
        }
    }
    completionProviderConfig.setConfig(config)
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
