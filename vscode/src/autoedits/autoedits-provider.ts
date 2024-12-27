import { type DebouncedFunc, debounce } from 'lodash'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'

import {
    type ChatClient,
    type DocumentContext,
    currentResolvedConfig,
    tokensToChars,
} from '@sourcegraph/cody-shared'

import { ContextRankingStrategy } from '../completions/context/completions-context-ranker'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { getCurrentDocContext } from '../completions/get-current-doc-context'

import type { AutoeditsModelAdapter, AutoeditsPrompt } from './adapters/base'
import { createAutoeditsModelAdapter } from './adapters/create-adapter'
import { autoeditsProviderConfig } from './autoedits-config'
import { FilterPredictionBasedOnRecentEdits } from './filter-prediction-edits'
import { autoeditsOutputChannelLogger } from './output-channel-logger'
import type { CodeToReplaceData } from './prompt/prompt-utils'
import { ShortTermPromptStrategy } from './prompt/short-term-diff-prompt-strategy'
import type { DecorationInfo } from './renderer/decorators/base'
import { DefaultDecorator } from './renderer/decorators/default-decorator'
import { InlineDiffDecorator } from './renderer/decorators/inline-diff-decorator'
import { getDecorationInfo } from './renderer/diff-utils'
import { AutoEditsInlineRendererManager } from './renderer/inline-manager'
import { AutoEditsDefaultRendererManager, type AutoEditsRendererManager } from './renderer/manager'
import {
    extractAutoEditResponseFromCurrentDocumentCommentTemplate,
    shrinkReplacerTextToCodeToReplaceRange,
} from './renderer/mock-renderer'
import { shrinkPredictionUntilSuffix } from './shrink-prediction'
import { isPredictedTextAlreadyInSuffix } from './utils'

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

/**
 * Provides inline completions and auto-edits functionality.
 *
 * Before introducing new logic into the AutoEditsProvider class, evaluate whether it can be abstracted into a separate component.
 * This practice ensures that AutoEditsProvider remains focused on its primary responsibilities of triggering and providing completions
 */
export class AutoeditsProvider implements vscode.InlineCompletionItemProvider, vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = []
    /** Keeps track of the last time the text was changed in the editor. */
    private lastTextChangeTimeStamp: number | undefined
    private readonly onSelectionChangeDebounced: DebouncedFunc<typeof this.onSelectionChange>
    public readonly rendererManager: AutoEditsRendererManager
    private readonly modelAdapter: AutoeditsModelAdapter

    private readonly promptStrategy = new ShortTermPromptStrategy()
    public readonly filterPrediction = new FilterPredictionBasedOnRecentEdits()
    private readonly contextMixer = new ContextMixer({
        strategyFactory: new DefaultContextStrategyFactory(Observable.of(AUTOEDITS_CONTEXT_STRATEGY)),
        contextRankingStrategy: ContextRankingStrategy.TimeBased,
        dataCollectionEnabled: false,
    })

    constructor(chatClient: ChatClient) {
        autoeditsOutputChannelLogger.logDebug('Constructor', 'Constructing AutoEditsProvider')
        this.modelAdapter = createAutoeditsModelAdapter({
            providerName: autoeditsProviderConfig.provider,
            isChatModel: autoeditsProviderConfig.isChatModel,
            chatClient: chatClient,
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
            (event: vscode.TextEditorSelectionChangeEvent) => this.onSelectionChange(event),
            ON_SELECTION_CHANGE_DEFAULT_DEBOUNCE_INTERVAL_MS
        )

        this.disposables.push(
            this.contextMixer,
            this.rendererManager,
            vscode.window.onDidChangeTextEditorSelection(this.onSelectionChangeDebounced),
            vscode.workspace.onDidChangeTextDocument(event => {
                this.onDidChangeTextDocument(event)
            })
        )
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        if (event.document.uri.scheme !== 'file') {
            return
        }
        this.lastTextChangeTimeStamp = Date.now()
    }

    private async onSelectionChange(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
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
        inlineCompletionContext: vscode.InlineCompletionContext,
        token?: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {
        const start = Date.now()
        const controller = new AbortController()
        const abortSignal = controller.signal
        token?.onCancellationRequested(() => controller.abort())

        await new Promise(resolve => setTimeout(resolve, INLINE_COMPLETION_DEFAULT_DEBOUNCE_INTERVAL_MS))
        if (abortSignal.aborted) {
            autoeditsOutputChannelLogger.logDebug(
                'provideInlineCompletionItems',
                'debounce aborted before calculating getCurrentDocContext'
            )
            return null
        }

        autoeditsOutputChannelLogger.logDebug(
            'provideInlineCompletionItems',
            'Calculating getCurrentDocContext...'
        )
        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: tokensToChars(autoeditsProviderConfig.tokenLimit.prefixTokens),
            maxSuffixLength: tokensToChars(autoeditsProviderConfig.tokenLimit.suffixTokens),
        })

        autoeditsOutputChannelLogger.logDebug(
            'provideInlineCompletionItems',
            'Calculating context from contextMixer...'
        )
        const { context } = await this.contextMixer.getContext({
            document,
            position,
            docContext,
            maxChars: 32_000,
        })
        if (abortSignal.aborted) {
            autoeditsOutputChannelLogger.logDebug(
                'provideInlineCompletionItems',
                'aborted in getContext'
            )
            return null
        }

        autoeditsOutputChannelLogger.logDebug(
            'provideInlineCompletionItems',
            'Calculating prompt from promptStrategy...'
        )
        const { codeToReplaceData, prompt } = this.promptStrategy.getPromptForModelType({
            document,
            position,
            docContext,
            context,
            tokenBudget: autoeditsProviderConfig.tokenLimit,
            isChatModel: autoeditsProviderConfig.isChatModel,
        })

        autoeditsOutputChannelLogger.logDebug(
            'provideInlineCompletionItems',
            'Calculating prediction from getPrediction...'
        )
        const initialPrediction = await this.getPrediction({
            document,
            position,
            prompt,
            codeToReplaceData,
        })
        if (abortSignal?.aborted || !initialPrediction) {
            autoeditsOutputChannelLogger.logDebug(
                'provideInlineCompletionItems',
                'aborted after getPrediction'
            )
            return null
        }

        autoeditsOutputChannelLogger.logDebug(
            'provideInlineCompletionItems',
            `========================== Response:\n${initialPrediction}\n` +
                `========================== Time Taken: ${Date.now() - start}ms`
        )

        const prediction = shrinkPredictionUntilSuffix({
            prediction: initialPrediction,
            codeToReplaceData,
        })

        const { codeToRewrite } = codeToReplaceData
        if (prediction === codeToRewrite) {
            autoeditsOutputChannelLogger.logDebug('skip', 'prediction equals to code to rewrite')
            return null
        }

        const shouldFilterPredictionBasedRecentEdits = this.filterPrediction.shouldFilterPrediction({
            uri: document.uri,
            prediction,
            codeToRewrite,
        })

        if (shouldFilterPredictionBasedRecentEdits) {
            autoeditsOutputChannelLogger.logDebug('skip', 'based on recent edits')
            return null
        }

        const decorationInfo = getDecorationInfoFromPrediction(document, prediction, codeToReplaceData)

        if (
            isPredictedTextAlreadyInSuffix({
                codeToRewrite,
                decorationInfo,
                suffix: codeToReplaceData.suffixInArea + codeToReplaceData.suffixAfterArea,
            })
        ) {
            autoeditsOutputChannelLogger.logDebug('skip', 'prediction equals to code to rewrite')
            return null
        }

        const { inlineCompletions } =
            await this.rendererManager.maybeRenderDecorationsAndTryMakeInlineCompletionResponse({
                prediction,
                codeToReplaceData,
                document,
                position,
                docContext,
                decorationInfo,
            })

        return inlineCompletions
    }

    private async getPrediction({
        document,
        position,
        codeToReplaceData,
        prompt,
    }: {
        document: vscode.TextDocument
        position: vscode.Position
        codeToReplaceData: CodeToReplaceData
        prompt: AutoeditsPrompt
    }): Promise<string | undefined> {
        if (autoeditsProviderConfig.isMockResponseFromCurrentDocumentTemplateEnabled) {
            const responseMetadata = extractAutoEditResponseFromCurrentDocumentCommentTemplate(
                document,
                position
            )

            if (responseMetadata) {
                const prediction = shrinkReplacerTextToCodeToReplaceRange(
                    responseMetadata,
                    codeToReplaceData
                )

                if (prediction) {
                    return prediction
                }
            }
        }

        return this.modelAdapter.getModelResponse({
            url: autoeditsProviderConfig.url,
            model: autoeditsProviderConfig.model,
            prompt,
            codeToRewrite: codeToReplaceData.codeToRewrite,
            userId: (await currentResolvedConfig()).clientState.anonymousUserID,
            isChatModel: autoeditsProviderConfig.isChatModel,
        })
    }

    public dispose(): void {
        this.onSelectionChangeDebounced.cancel()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}

export function getDecorationInfoFromPrediction(
    document: vscode.TextDocument,
    prediction: string,
    codeToReplaceData: CodeToReplaceData
): DecorationInfo {
    const currentFileText = document.getText()
    const predictedFileText =
        currentFileText.slice(0, document.offsetAt(codeToReplaceData.range.start)) +
        prediction +
        currentFileText.slice(document.offsetAt(codeToReplaceData.range.end))

    const decorationInfo = getDecorationInfo(currentFileText, predictedFileText)
    return decorationInfo
}
