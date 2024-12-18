import { type DebouncedFunc, debounce } from 'lodash'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'

import {
    type AutoEditsModelConfig,
    type AutoEditsTokenLimit,
    type AutocompleteContextSnippet,
    type ChatClient,
    type DocumentContext,
    currentResolvedConfig,
    dotcomTokenToGatewayToken,
    isDotComAuthed,
    tokensToChars,
} from '@sourcegraph/cody-shared'
import { ContextRankingStrategy } from '../completions/context/completions-context-ranker'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { RetrieverIdentifier } from '../completions/context/utils'
import { getCurrentDocContext } from '../completions/get-current-doc-context'
import { getConfiguration } from '../configuration'
import type { AutoeditsModelAdapter, AutoeditsPrompt } from './adapters/base'
import { CodyGatewayAdapter } from './adapters/cody-gateway'
import { FireworksAdapter } from './adapters/fireworks'
import { OpenAIAdapter } from './adapters/openai'
import { SourcegraphChatAdapter } from './adapters/sourcegraph-chat'
import { SourcegraphCompletionsAdapter } from './adapters/sourcegraph-completions'
import { FilterPredictionBasedOnRecentEdits } from './filter-prediction-edits'
import { autoeditsLogger } from './logger'
import type { AutoeditsUserPromptStrategy } from './prompt/base'
import { SYSTEM_PROMPT } from './prompt/constants'
import { type CodeToReplaceData, getCompletionsPromptWithSystemPrompt } from './prompt/prompt-utils'
import { ShortTermPromptStrategy } from './prompt/short-term-diff-prompt-strategy'
import { DefaultDecorator } from './renderer/decorators/default-decorator'
import { InlineDiffDecorator } from './renderer/decorators/inline-diff-decorator'
import { getDecorationInfo } from './renderer/diff-utils'
import { AutoEditsInlineRendererManager } from './renderer/inline-manager'
import { AutoEditsDefaultRendererManager, type AutoEditsRendererManager } from './renderer/manager'
import {
    extractAutoEditResponseFromCurrentDocumentCommentTemplate,
    shrinkReplacerTextToCodeToReplaceRange,
} from './renderer/renderer-testing'
// import { shrinkPredictionUntilSuffix } from './shrink-prediction'

const AUTOEDITS_CONTEXT_STRATEGY = 'auto-edits'
const INLINE_COMPLETION_DEFAULT_DEBOUNCE_INTERVAL_MS = 150
const ON_SELECTION_CHANGE_DEFAULT_DEBOUNCE_INTERVAL_MS = 150
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
    // Is the model a chat model or a completions model
    isChatModel: boolean
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
    /** Keeps track of the last time the text was changed in the editor. */
    private lastTextChangeTimeStamp: number | undefined
    private readonly promptProvider: AutoeditsUserPromptStrategy = new ShortTermPromptStrategy()
    private readonly filterPrediction = new FilterPredictionBasedOnRecentEdits()

    private isMockResponseFromCurrentDocumentTemplateEnabled = vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.experimental.autoedits.use-mock-responses', false)

    constructor(private readonly chatClient: ChatClient) {
        this.contextMixer = new ContextMixer({
            strategyFactory: new DefaultContextStrategyFactory(
                Observable.of(AUTOEDITS_CONTEXT_STRATEGY)
            ),
            contextRankingStrategy: ContextRankingStrategy.TimeBased,
            dataCollectionEnabled: false,
        })

        const enabledRenderer = vscode.workspace
            .getConfiguration()
            .get<'default' | 'inline'>('cody.experimental.autoedits.renderer', 'default')

        this.rendererManager =
            enabledRenderer === 'inline'
                ? new AutoEditsInlineRendererManager(editor => new InlineDiffDecorator(editor))
                : new AutoEditsDefaultRendererManager(
                      (editor: vscode.TextEditor) => new DefaultDecorator(editor)
                  )

        this.onSelectionChangeDebounced = debounce(
            (event: vscode.TextEditorSelectionChangeEvent) => this.autoeditOnSelectionChange(event),
            ON_SELECTION_CHANGE_DEFAULT_DEBOUNCE_INTERVAL_MS
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
            provider: this.createPromptProvider(baseConfig.provider, baseConfig.isChatModel),
            model: baseConfig.model,
            url: baseConfig.url,
            tokenLimit: baseConfig.tokenLimit,
            isChatModel: baseConfig.isChatModel,
        }
    }

    private createPromptProvider(
        providerName: AutoEditsModelConfig['provider'],
        isChatModel: boolean
    ): AutoeditsModelAdapter {
        switch (providerName) {
            case 'openai':
                return new OpenAIAdapter()
            case 'fireworks':
                return new FireworksAdapter()
            case 'cody-gateway':
                return new CodyGatewayAdapter()
            case 'sourcegraph':
                return isChatModel
                    ? new SourcegraphChatAdapter(this.chatClient)
                    : new SourcegraphCompletionsAdapter()
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

        await new Promise(resolve => setTimeout(resolve, INLINE_COMPLETION_DEFAULT_DEBOUNCE_INTERVAL_MS))
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
        const shouldFilterPredictionBasedRecentEdits = this.filterPrediction.shouldFilterPrediction(
            document.uri,
            prediction,
            codeToReplaceData.codeToRewrite
        )
        if (shouldFilterPredictionBasedRecentEdits) {
            return null
        }

        // prediction = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)

        if (prediction === codeToReplaceData.codeToRewrite) {
            return null
        }

        const currentFileText = document.getText()
        const predictedFileText =
            currentFileText.slice(0, document.offsetAt(codeToReplaceData.range.start)) +
            prediction +
            currentFileText.slice(document.offsetAt(codeToReplaceData.range.end))

        const decorationInfo = getDecorationInfo(currentFileText, predictedFileText)

        const { inlineCompletions } =
            await this.rendererManager.maybeRenderDecorationsAndTryMakeInlineCompletionResponse(
                prediction,
                codeToReplaceData,
                document,
                position,
                docContext,
                decorationInfo
            )

        return inlineCompletions
    }

    private async inferEdit(options: AutoEditsProviderOptions): Promise<AutoeditsPrediction | null> {
        const start = Date.now()
        const { context } = await this.contextMixer.getContext({
            document: options.document,
            position: options.position,
            docContext: options.docContext,
            maxChars: 32_000,
        })

        const { codeToReplace, promptResponse: prompt } = this.getPrompt(
            options.docContext,
            options.document,
            options.position,
            context,
            this.config.tokenLimit
        )
        const apiKey = await this.getApiKey()

        let response: string | undefined = undefined
        if (this.isMockResponseFromCurrentDocumentTemplateEnabled) {
            const responseMetadata = extractAutoEditResponseFromCurrentDocumentCommentTemplate()

            if (responseMetadata) {
                response = shrinkReplacerTextToCodeToReplaceRange(responseMetadata, codeToReplace)
            }
        }

        if (response === undefined) {
            response = await this.config.provider.getModelResponse({
                url: this.config.url,
                model: this.config.model,
                apiKey,
                prompt,
                codeToRewrite: codeToReplace.codeToRewrite,
                userId: (await currentResolvedConfig()).clientState.anonymousUserID,
                isChatModel: this.config.isChatModel,
            })
        }

        if (options.abortSignal?.aborted || !response) {
            return null
        }

        autoeditsLogger.logDebug(
            'Autoedits',
            '========================== Response:\n',
            response,
            '\n',
            '========================== Time Taken For LLM (Msec): ',
            (Date.now() - start).toString(),
            '\n'
        )

        return {
            codeToReplaceData: codeToReplace,
            prediction: response,
        }
    }

    private getPrompt(
        docContext: DocumentContext,
        document: vscode.TextDocument,
        position: vscode.Position,
        context: AutocompleteContextSnippet[],
        tokenBudget: AutoEditsTokenLimit
    ): {
        codeToReplace: CodeToReplaceData
        promptResponse: AutoeditsPrompt
    } {
        const { codeToReplace, prompt: userPrompt } = this.promptProvider.getUserPrompt({
            docContext,
            document,
            position,
            context,
            tokenBudget,
        })
        const prompt: AutoeditsPrompt = this.config.isChatModel
            ? { systemMessage: SYSTEM_PROMPT, userMessage: userPrompt }
            : { userMessage: getCompletionsPromptWithSystemPrompt(SYSTEM_PROMPT, userPrompt) }
        return {
            codeToReplace,
            promptResponse: prompt,
        }
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
        // Use fast-path for dotcom
        if (isDotComAuthed()) {
            return {
                provider: 'cody-gateway',
                model: 'autoedits-deepseek-lite-default',
                url: 'https://cody-gateway.sourcegraph.com/v1/completions/fireworks',
                tokenLimit: defaultTokenLimit,
                isChatModel: false,
            }
        }
        return {
            provider: 'sourcegraph',
            model: 'fireworks::v1::autoedits-deepseek-lite-default',
            tokenLimit: defaultTokenLimit,
            // We use completions client for sourcegraph provider, so we don't need to specify url.
            url: '',
            isChatModel: false,
        }
    }

    private async getApiKey(): Promise<string> {
        if (this.config.providerName === 'cody-gateway') {
            const config = await currentResolvedConfig()
            const fastPathAccessToken = dotcomTokenToGatewayToken(config.auth.accessToken)
            if (!fastPathAccessToken) {
                autoeditsLogger.logError('Autoedits', 'FastPath access token is not available')
                throw new Error('FastPath access token is not available')
            }
            return fastPathAccessToken
        }
        if (this.config.providerName === 'sourcegraph') {
            // We use chat completions client for sourcegraph-chat, so we don't need to specify api key.
            return ''
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
