import fs from 'fs';
import * as path from 'node:path'
import { type FileURI, type MultimodelSingleModelConfig, isDotCom } from '@sourcegraph/cody-shared'
import _ from 'lodash'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import { logDebug } from '../log'
import type { InlineCompletionItemProviderArgs } from './create-inline-completion-item-provider'
import type { MultiModelCompletionsResults } from './inline-completion-item-provider'
import { InlineCompletionItemProvider } from './inline-completion-item-provider'
import { createProviderConfigFromVSCodeConfig } from './providers/create-provider'

function getLoggingDirPath(): FileURI {
    switch (process.platform) {
        case 'darwin':
            return URI.file(
                `${process.env.HOME}/Library/Caches/com.sourcegraph.cody/multi-model-completion`
            )
        case 'linux':
            return URI.file(`${process.env.HOME}/.cache/com.sourcegraph.cody/multi-model-completion`)
        case 'win32':
            return URI.file(`${process.env.LOCALAPPDATA}\\com.sourcegraph.cody\\multi-model-completion`)
        default:
            throw new Error(`Unsupported platform: ${process.platform}`)
    }
}

async function createLogsFileIfNotExist(): Promise<string> {
    const dirPath = getLoggingDirPath().fsPath
    await fs.promises.mkdir(dirPath, { recursive: true })
    const fileName = 'cody-custom-completions.jsonl'
    const filePath = path.join(dirPath, fileName)
    if (
        !(await fs.promises
            .access(filePath)
            .then(() => true)
            .catch(() => false))
    ) {
        await fs.promises.writeFile(filePath, '')
    }
    return filePath
}

async function appendCompletionLogsFile(
    document: vscode.TextDocument,
    position: vscode.Position,
    completions: MultiModelCompletionsResults[]
) {
    // Add logs to a local file for analysis
    const logFilePath = await createLogsFileIfNotExist()
    const prefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position))
    const suffix = document.getText(
        new vscode.Range(position, document.positionAt(document.getText().length))
    )
    const fileName = path.basename(document.fileName)
    const dataToLog: { [key: string]: string } = {
        fileName,
        prefix,
        suffix,
    }
    for (const result of completions) {
        const modelName = result.model
        dataToLog[modelName] = result.completion ? result.completion : ''
    }
    await fs.promises.appendFile(logFilePath, JSON.stringify(dataToLog) + '\n')
}

export async function triggerMultiModelAutocompletionsForComparison(
    allCompletionsProviders: InlineCompletionItemProvider[]
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
    for (const provider of allCompletionsProviders) {
        allPromises.push(provider.manuallyGetCompletionItemsForProvider(document, position, context))
    }
    const completions = await Promise.all(allPromises)
    appendCompletionLogsFile(document, position, completions)
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
    authProvider,
    triggerNotice,
    createBfgRetriever,
}: InlineCompletionItemProviderArgs): Promise<vscode.Disposable> {
    // Creates multiple providers to get completions from.
    // The primary purpose of this method is to get the completions generated from multiple providers,
    // which helps judge the quality of code completions
    const authStatus = authProvider.getAuthStatus()
    if (!authStatus.isLoggedIn || config.autocompleteExperimentalMultiModelCompletions === undefined) {
        return {
            dispose: () => {},
        }
    }

    const disposables: vscode.Disposable[] = []

    const multiModelConfigsList: MultimodelSingleModelConfig[] = []
    for (const curretProviderConfig of config.autocompleteExperimentalMultiModelCompletions) {
        if (curretProviderConfig.provider && curretProviderConfig.model) {
            multiModelConfigsList.push({
                provider: curretProviderConfig.provider,
                model: curretProviderConfig.model,
                enableExperimentalFireworksOverrides:
                    curretProviderConfig.enableExperimentalFireworksOverrides ?? false,
            })
        }
    }

    if (multiModelConfigsList.length === 0) {
        return {
            dispose: () => {},
        }
    }

    const allPromises = multiModelConfigsList.map(async curretProviderConfig => {
        const newConfig = _.cloneDeep(config)
        // We should only override the fireworks "cody.autocomplete.experimental.fireworksOptions" when added in the config.
        newConfig.autocompleteExperimentalFireworksOptions =
            curretProviderConfig.enableExperimentalFireworksOverrides
                ? config.autocompleteExperimentalFireworksOptions
                : undefined
        // Don't use the advanced provider config to get the model
        newConfig.autocompleteAdvancedModel = null

        const providerConfig = await createProviderConfigFromVSCodeConfig(
            client,
            authStatus,
            curretProviderConfig.model,
            curretProviderConfig.provider,
            newConfig
        )
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
                noAnalytics: true,
            })
            return completionsProvider
        }
        // biome-ignore lint/style/noUselessElse: returns undefined if provider config not valid
        else {
            return undefined
        }
    })
    const allProviders = await Promise.all(allPromises)
    const allCompletionsProviders: InlineCompletionItemProvider[] = []
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
