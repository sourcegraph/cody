import {
    type AutoEditsModelConfig,
    type AutoEditsTokenLimit,
    type DocumentContext,
    currentResolvedConfig,
    dotcomTokenToGatewayToken,
    tokensToChars,
} from '@sourcegraph/cody-shared'
import { type DebouncedFunc, debounce } from 'lodash'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'
import { ContextRankingStrategy } from '../completions/context/completions-context-ranker'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { RetrieverIdentifier } from '../completions/context/utils'
import { getCurrentDocContext } from '../completions/get-current-doc-context'
import { completionMatchesSuffix } from '../completions/is-completion-visible'
import { getConfiguration } from '../configuration'
import { CodyGatewayAdapter } from './adapters/cody-gateway'
import { FireworksAdapter } from './adapters/fireworks'
import { OpenAIAdapter } from './adapters/openai'
import { autoeditsLogger } from './logger'
import type { AutoeditsModelAdapter } from './prompt-provider'
import type { CodeToReplaceData } from './prompt-utils'
import { AutoEditsRendererManager } from './renderer'
import {
    adjustPredictionIfInlineCompletionPossible,
    extractInlineCompletionFromRewrittenCode,
} from './utils'
import { isPredictedTextAlreadyInSuffix } from './utils'

const AUTOEDITS_CONTEXT_STRATEGY = 'auto-edits'
const INLINE_COMPLETETION_DEFAULT_DEBOUNCE_INTERVAL_MS = 150
const ONSELECTION_CHANGE_DEFAULT_DEBOUNCE_INTERVAL_MS = 150
const RESET_SUGGESTION_ON_CURSOR_CHANGE_AFTER_INTERVAL_MS = 60 * 1000

export interface AutoEditsProviderOptions {
    document: vscode.TextDocument
    position: vscode.Position
    docContext: DocumentContext
    abortSignal?: AbortSignal
}

export interface AutoeditsPrediction {
    codeToReplaceData: CodeToReplaceData
    prediction: string
}

interface ProviderConfig {
    experimentalAutoeditsConfigOverride: AutoEditsModelConfig | undefined
    providerName: AutoEditsModelConfig['provider']
    provider: AutoeditsModelAdapter
    model: string
    url: string
    tokenLimit: AutoEditsTokenLimit
}

/**
 * Provides inline completions and auto-edits functionality.
 */
export class AutoeditsProvider implements vscode.InlineCompletionItemProvider, vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = []
    private readonly contextMixer: ContextMixer
    private readonly rendererManager: AutoEditsRendererManager
    private readonly config: ProviderConfig
    private readonly onSelectionChangeDebounced: DebouncedFunc<typeof this.autoeditOnSelectionChange>
    // Keeps track of the last time the text was changed in the editor.
    private lastTextChangeTimeStamp: number | undefined

    constructor() {
        this.contextMixer = new ContextMixer({
            strategyFactory: new DefaultContextStrategyFactory(
                Observable.of(AUTOEDITS_CONTEXT_STRATEGY)
            ),
            contextRankingStrategy: ContextRankingStrategy.TimeBased,
            dataCollectionEnabled: false,
        })
        this.rendererManager = new AutoEditsRendererManager()
        this.onSelectionChangeDebounced = debounce(
            (event: vscode.TextEditorSelectionChangeEvent) => this.autoeditOnSelectionChange(event),
            ONSELECTION_CHANGE_DEFAULT_DEBOUNCE_INTERVAL_MS
        )
        this.config = this.initializeConfig()

        this.disposables.push(
            this.contextMixer,
            this.rendererManager,
            vscode.window.onDidChangeTextEditorSelection(this.onSelectionChangeDebounced),
            vscode.workspace.onDidChangeTextDocument(event => {
                this.onDidChangeTextDocument(event)
            })
        )
    }

    private initializeConfig(): ProviderConfig {
        const userConfig = getConfiguration().experimentalAutoeditsConfigOverride
        const baseConfig = userConfig ?? this.getDefaultConfig()

        return {
            experimentalAutoeditsConfigOverride: userConfig,
            providerName: baseConfig.provider,
            provider: this.createPromptProvider(baseConfig.provider),
            model: baseConfig.model,
            url: baseConfig.url,
            tokenLimit: baseConfig.tokenLimit,
        }
    }

    private createPromptProvider(providerName: AutoEditsModelConfig['provider']): AutoeditsModelAdapter {
        switch (providerName) {
            case 'openai':
                return new OpenAIAdapter()
            case 'fireworks':
                return new FireworksAdapter()
            case 'cody-gateway-fastpath-chat':
                return new CodyGatewayAdapter()
            default:
                autoeditsLogger.logDebug('Config', `Provider ${providerName} not supported`)
                throw new Error(`Provider ${providerName} not supported`)
        }
    }

    private async autoeditOnSelectionChange(
        event: vscode.TextEditorSelectionChangeEvent
    ): Promise<void> {
        const lastSelection = event.selections.at(-1)
        const { document } = event.textEditor
        if (!lastSelection?.isEmpty || document.uri.scheme !== 'file') {
            return
        }
        if (this.rendererManager.hasActiveEdit()) {
            return
        }
        // Don't show suggestion on cursor movement if the text has not changed for a certain amount of time
        if (
            this.lastTextChangeTimeStamp &&
            Date.now() - this.lastTextChangeTimeStamp <
                RESET_SUGGESTION_ON_CURSOR_CHANGE_AFTER_INTERVAL_MS
        ) {
            await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
        }
    }

    public async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token?: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {
        const controller = new AbortController()
        token?.onCancellationRequested(() => controller.abort())

        await new Promise(resolve =>
            setTimeout(resolve, INLINE_COMPLETETION_DEFAULT_DEBOUNCE_INTERVAL_MS)
        )
        return this.showAutoEdit(document, position, controller.signal)
    }

    private async showAutoEdit(
        document: vscode.TextDocument,
        position: vscode.Position,
        abortSignal: AbortSignal
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {
        if (abortSignal.aborted) {
            return null
        }
        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: tokensToChars(this.config.tokenLimit.prefixTokens),
            maxSuffixLength: tokensToChars(this.config.tokenLimit.suffixTokens),
        })
        const autoeditResponse = await this.inferEdit({
            document,
            position,
            docContext,
            abortSignal,
        })
        if (abortSignal.aborted || !autoeditResponse) {
            return null
        }
        const { prediction, codeToReplaceData } = autoeditResponse
        const inlineCompletionItems = this.tryMakeInlineCompletionResponse(
            prediction,
            codeToReplaceData,
            document,
            position,
            docContext
        )
        if (inlineCompletionItems) {
            return inlineCompletionItems
        }
        await this.showEditAsDecorations(document, codeToReplaceData, prediction)
        return null
    }

    private tryMakeInlineCompletionResponse(
        originalPrediction: string,
        codeToReplace: CodeToReplaceData,
        document: vscode.TextDocument,
        position: vscode.Position,
        docContext: DocumentContext
    ): vscode.InlineCompletionItem[] | null {
        const prediction = adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            codeToReplace.codeToRewritePrefix,
            codeToReplace.codeToRewriteSuffix
        )
        const codeToRewriteAfterCurrentLine = codeToReplace.codeToRewriteSuffix.slice(
            docContext.currentLineSuffix.length + 1 // Additional char for newline
        )
        const isPrefixMatch = prediction.startsWith(codeToReplace.codeToRewritePrefix)
        const isSuffixMatch =
            // The current line suffix should not require any char removals to render the completion.
            completionMatchesSuffix(
                { insertText: codeToReplace.codeToRewriteSuffix },
                docContext.currentLineSuffix
            ) &&
            // The new lines suggested after the current line must be equal to the prediction.
            prediction.endsWith(codeToRewriteAfterCurrentLine)

        if (isPrefixMatch && isSuffixMatch) {
            const autocompleteInlineResponse = extractInlineCompletionFromRewrittenCode(
                prediction,
                codeToReplace.codeToRewritePrefix,
                codeToReplace.codeToRewriteSuffix
            )
            const autocompleteResponse = docContext.currentLinePrefix + autocompleteInlineResponse
            const inlineCompletionItem = new vscode.InlineCompletionItem(
                autocompleteResponse,
                new vscode.Range(
                    document.lineAt(position).range.start,
                    document.lineAt(position).range.end
                )
            )
            autoeditsLogger.logDebug('Autocomplete Inline Response: ', autocompleteResponse)
            return [inlineCompletionItem]
        }
        return null
    }

    private async inferEdit(options: AutoEditsProviderOptions): Promise<AutoeditsPrediction | null> {
        const start = Date.now()
        const { context } = await this.contextMixer.getContext({
            document: options.document,
            position: options.position,
            docContext: options.docContext,
            maxChars: 32_000,
        })

        const { codeToReplace, promptResponse: prompt } = this.config.provider.getPrompt(
            options.docContext,
            options.document,
            options.position,
            context,
            this.config.tokenLimit
        )
        const apiKey = await this.getApiKey()
        const response = await this.config.provider.getModelResponse({
            url: this.config.url,
            model: this.config.model,
            apiKey,
            prompt,
            codeToRewrite: codeToReplace.codeToRewrite,
            userId: (await currentResolvedConfig()).clientState.anonymousUserID,
        })
        const postProcessedResponse = this.config.provider.postProcessResponse(codeToReplace, response)

        if (options.abortSignal?.aborted || !postProcessedResponse) {
            return null
        }

        autoeditsLogger.logDebug(
            'Autoedits',
            '========================== Response:\n',
            postProcessedResponse,
            '\n',
            '========================== Time Taken For LLM (Msec): ',
            (Date.now() - start).toString(),
            '\n'
        )

        return {
            codeToReplaceData: codeToReplace,
            prediction: postProcessedResponse,
        }
    }

    private async showEditAsDecorations(
        document: vscode.TextDocument,
        codeToReplaceData: CodeToReplaceData,
        prediction: string
    ): Promise<void> {
        const currentFileText = document.getText()
        const predictedFileText =
            currentFileText.slice(0, document.offsetAt(codeToReplaceData.range.start)) +
            prediction +
            currentFileText.slice(document.offsetAt(codeToReplaceData.range.end))
        if (
            isPredictedTextAlreadyInSuffix({
                codeToRewrite: codeToReplaceData.codeToRewrite,
                prediction,
                suffix: codeToReplaceData.suffixInArea + codeToReplaceData.suffixAfterArea,
            })
        ) {
            autoeditsLogger.logDebug(
                'Autoedits',
                'Skipping autoedit - predicted text already exists in suffix'
            )
            return
        }
        await this.rendererManager.showEdit({
            document,
            range: codeToReplaceData.range,
            prediction,
            currentFileText,
            predictedFileText,
        })
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        if (event.document.uri.scheme !== 'file') {
            return
        }
        this.lastTextChangeTimeStamp = Date.now()
    }

    private getDefaultConfig(): Omit<AutoEditsModelConfig, 'apiKey'> {
        const defaultTokenLimit: AutoEditsTokenLimit = {
            prefixTokens: 2500,
            suffixTokens: 2500,
            maxPrefixLinesInArea: 11,
            maxSuffixLinesInArea: 4,
            codeToRewritePrefixLines: 1,
            codeToRewriteSuffixLines: 2,
            contextSpecificTokenLimit: {
                [RetrieverIdentifier.RecentEditsRetriever]: 1500,
                [RetrieverIdentifier.JaccardSimilarityRetriever]: 0,
                [RetrieverIdentifier.RecentCopyRetriever]: 500,
                [RetrieverIdentifier.DiagnosticsRetriever]: 500,
                [RetrieverIdentifier.RecentViewPortRetriever]: 2500,
            },
        }
        return {
            provider: 'cody-gateway-fastpath-chat',
            model: 'cody-model-auto-edits-fireworks-default',
            url: 'https://cody-gateway.sourcegraph.com/v1/completions/fireworks',
            tokenLimit: defaultTokenLimit,
        }
    }

    private async getApiKey(): Promise<string> {
        if (this.config.providerName === 'cody-gateway-fastpath-chat') {
            const config = await currentResolvedConfig()
            const fastPathAccessToken = dotcomTokenToGatewayToken(config.auth.accessToken)
            if (!fastPathAccessToken) {
                autoeditsLogger.logError('Autoedits', 'FastPath access token is not available')
                throw new Error('FastPath access token is not available')
            }
            return fastPathAccessToken
        }
        if (this.config.experimentalAutoeditsConfigOverride?.apiKey) {
            return this.config.experimentalAutoeditsConfigOverride.apiKey
        }
        autoeditsLogger.logError('Autoedits', 'No api key provided in the config override')
        throw new Error('No api key provided in the config override')
    }

    public dispose(): void {
        this.onSelectionChangeDebounced.cancel()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
