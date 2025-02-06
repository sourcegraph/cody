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
import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import type { FixupController } from '../non-stop/FixupController'

import type { AutoeditsModelAdapter, AutoeditsPrompt } from './adapters/base'
import { createAutoeditsModelAdapter } from './adapters/create-adapter'
import {
    type AutoeditRequestID,
    autoeditAnalyticsLogger,
    autoeditDiscardReason,
    autoeditSource,
    autoeditTriggerKind,
    getTimeNowInMillis,
} from './analytics-logger'
import { autoeditsProviderConfig } from './autoedits-config'
import { FilterPredictionBasedOnRecentEdits } from './filter-prediction-edits'
import { autoeditsOutputChannelLogger } from './output-channel-logger'
import { type CodeToReplaceData, getCodeToReplaceData } from './prompt/prompt-utils'
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
import { areSameUriDocs, isPredictedTextAlreadyInSuffix } from './utils'

const AUTOEDITS_CONTEXT_STRATEGY = 'auto-edit'
export const INLINE_COMPLETION_DEFAULT_DEBOUNCE_INTERVAL_MS = 150
const ON_SELECTION_CHANGE_DEFAULT_DEBOUNCE_INTERVAL_MS = 150
const RESET_SUGGESTION_ON_CURSOR_CHANGE_AFTER_INTERVAL_MS = 60 * 1000

export interface AutoEditsProviderOptions {
    document: vscode.TextDocument
    position: vscode.Position
    docContext: DocumentContext
    abortSignal?: AbortSignal
}

export interface AutoeditsSuggestion {
    codeToReplaceData: CodeToReplaceData
    prediction: string
}

export interface AutoeditsResult extends vscode.InlineCompletionList {
    requestId: AutoeditRequestID
    prediction: string
    /** temporary data structure, will need to update before integrating with the agent API */
    decorationInfo: DecorationInfo
}

/**
 * Provides inline completions and auto-edit functionality.
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

    /**
     * Default: Current supported renderer
     * Inline: Experimental renderer that uses inline decorations to show additions
     */
    private readonly enabledRenderer = vscode.workspace
        .getConfiguration()
        .get<'default' | 'inline'>('cody.experimental.autoedit.renderer', 'default')

    private readonly promptStrategy = new ShortTermPromptStrategy()
    public readonly filterPrediction = new FilterPredictionBasedOnRecentEdits()
    private readonly contextMixer = new ContextMixer({
        strategyFactory: new DefaultContextStrategyFactory(Observable.of(AUTOEDITS_CONTEXT_STRATEGY)),
        contextRankingStrategy: ContextRankingStrategy.TimeBased,
        dataCollectionEnabled: false,
    })

    constructor(
        chatClient: ChatClient,
        fixupController: FixupController,
        options: { shouldRenderImage: boolean }
    ) {
        autoeditsOutputChannelLogger.logDebug('Constructor', 'Constructing AutoEditsProvider')
        this.modelAdapter = createAutoeditsModelAdapter({
            providerName: autoeditsProviderConfig.provider,
            isChatModel: autoeditsProviderConfig.isChatModel,
            chatClient: chatClient,
        })

        this.rendererManager =
            this.enabledRenderer === 'inline'
                ? new AutoEditsInlineRendererManager(
                      editor => new InlineDiffDecorator(editor),
                      fixupController
                  )
                : new AutoEditsDefaultRendererManager(
                      (editor: vscode.TextEditor) =>
                          new DefaultDecorator(editor, { shouldRenderImage: options.shouldRenderImage }),
                      fixupController
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
        if (event.document.uri.scheme === 'file') {
            this.lastTextChangeTimeStamp = Date.now()
        }
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
    ): Promise<AutoeditsResult | null> {
        try {
            const start = getTimeNowInMillis()
            const controller = new AbortController()
            const abortSignal = controller.signal
            token?.onCancellationRequested(() => controller.abort())

            await new Promise(resolve =>
                setTimeout(resolve, INLINE_COMPLETION_DEFAULT_DEBOUNCE_INTERVAL_MS)
            )
            if (abortSignal.aborted) {
                autoeditsOutputChannelLogger.logDebugIfVerbose(
                    'provideInlineCompletionItems',
                    'debounce aborted before calculating getCurrentDocContext'
                )
                return null
            }

            autoeditsOutputChannelLogger.logDebugIfVerbose(
                'provideInlineCompletionItems',
                'Calculating getCurrentDocContext...'
            )
            const docContext = getCurrentDocContext({
                document,
                position,
                maxPrefixLength: tokensToChars(autoeditsProviderConfig.tokenLimit.prefixTokens),
                maxSuffixLength: tokensToChars(autoeditsProviderConfig.tokenLimit.suffixTokens),
            })

            const codeToReplaceData = getCodeToReplaceData({
                docContext,
                document,
                position,
                tokenBudget: autoeditsProviderConfig.tokenLimit,
            })

            autoeditsOutputChannelLogger.logDebugIfVerbose(
                'provideInlineCompletionItems',
                'Calculating context from contextMixer...'
            )
            const { codeToRewrite } = codeToReplaceData
            const requestId = autoeditAnalyticsLogger.createRequest({
                startedAt: performance.now(),
                codeToReplaceData,
                position,
                docContext,
                document,
                payload: {
                    languageId: document.languageId,
                    model: autoeditsProviderConfig.model,
                    codeToRewrite,
                    triggerKind: autoeditTriggerKind.automatic,
                },
            })

            const { context, contextSummary } = await this.contextMixer.getContext({
                document,
                position,
                docContext,
                maxChars: 32_000,
            })
            autoeditAnalyticsLogger.markAsContextLoaded({
                requestId,
                payload: {
                    contextSummary,
                },
            })
            if (abortSignal.aborted) {
                autoeditsOutputChannelLogger.logDebugIfVerbose(
                    'provideInlineCompletionItems',
                    'aborted in getContext'
                )
                return null
            }

            autoeditsOutputChannelLogger.logDebugIfVerbose(
                'provideInlineCompletionItems',
                'Calculating prompt from promptStrategy...'
            )
            const prompt = this.promptStrategy.getPromptForModelType({
                document,
                codeToReplaceData,
                context,
                tokenBudget: autoeditsProviderConfig.tokenLimit,
                isChatModel: autoeditsProviderConfig.isChatModel,
            })

            autoeditsOutputChannelLogger.logDebugIfVerbose(
                'provideInlineCompletionItems',
                'Calculating prediction from getPrediction...'
            )
            const initialPrediction = await this.getPrediction({
                document,
                position,
                prompt,
                codeToReplaceData,
            })

            if (abortSignal?.aborted) {
                autoeditsOutputChannelLogger.logDebugIfVerbose(
                    'provideInlineCompletionItems',
                    'client aborted after getPrediction'
                )

                autoeditAnalyticsLogger.markAsDiscarded({
                    requestId,
                    discardReason: autoeditDiscardReason.clientAborted,
                })
                return null
            }

            if (initialPrediction === undefined || initialPrediction.length === 0) {
                autoeditsOutputChannelLogger.logDebugIfVerbose(
                    'provideInlineCompletionItems',
                    'received empty prediction'
                )

                autoeditAnalyticsLogger.markAsDiscarded({
                    requestId,
                    discardReason: autoeditDiscardReason.emptyPrediction,
                })
                return null
            }

            autoeditAnalyticsLogger.markAsLoaded({
                requestId,
                prompt,
                payload: {
                    source: autoeditSource.network,
                    isFuzzyMatch: false,
                    responseHeaders: {},
                    prediction: initialPrediction,
                },
            })
            autoeditsOutputChannelLogger.logDebug(
                'provideInlineCompletionItems',
                `"${requestId}" ============= Response:\n${initialPrediction}\n` +
                    `============= Time Taken: ${getTimeNowInMillis() - start}ms`
            )

            const prediction = shrinkPredictionUntilSuffix({
                prediction: initialPrediction,
                codeToReplaceData,
            })

            if (prediction === codeToRewrite) {
                autoeditsOutputChannelLogger.logDebugIfVerbose(
                    'provideInlineCompletionItems',
                    'prediction equals to code to rewrite'
                )
                autoeditAnalyticsLogger.markAsDiscarded({
                    requestId,
                    discardReason: autoeditDiscardReason.predictionEqualsCodeToRewrite,
                })
                return null
            }

            const shouldFilterPredictionBasedRecentEdits = this.filterPrediction.shouldFilterPrediction({
                uri: document.uri,
                prediction,
                codeToRewrite,
            })

            if (shouldFilterPredictionBasedRecentEdits) {
                autoeditsOutputChannelLogger.logDebugIfVerbose(
                    'provideInlineCompletionItems',
                    'based on recent edits'
                )
                autoeditAnalyticsLogger.markAsDiscarded({
                    requestId,
                    discardReason: autoeditDiscardReason.recentEdits,
                })
                return null
            }

            const decorationInfo = getDecorationInfoFromPrediction(
                document,
                prediction,
                codeToReplaceData
            )

            if (
                isPredictedTextAlreadyInSuffix({
                    codeToRewrite,
                    decorationInfo,
                    suffix: codeToReplaceData.suffixInArea + codeToReplaceData.suffixAfterArea,
                })
            ) {
                autoeditsOutputChannelLogger.logDebugIfVerbose(
                    'provideInlineCompletionItems',
                    'skip because the prediction equals to code to rewrite'
                )
                autoeditAnalyticsLogger.markAsDiscarded({
                    requestId,
                    discardReason: autoeditDiscardReason.suffixOverlap,
                })
                return null
            }

            const { inlineCompletionItems, updatedDecorationInfo, updatedPrediction } =
                this.rendererManager.tryMakeInlineCompletions({
                    requestId,
                    prediction,
                    codeToReplaceData,
                    document,
                    position,
                    docContext,
                    decorationInfo,
                })

            if (inlineCompletionItems === null && updatedDecorationInfo === null) {
                autoeditsOutputChannelLogger.logDebugIfVerbose(
                    'provideInlineCompletionItems',
                    'no suggestion to render'
                )
                autoeditAnalyticsLogger.markAsDiscarded({
                    requestId,
                    discardReason: autoeditDiscardReason.emptyPredictionAfterInlineCompletionExtraction,
                })
                return null
            }

            const editor = vscode.window.activeTextEditor
            if (!editor || !areSameUriDocs(document, editor.document)) {
                autoeditsOutputChannelLogger.logDebugIfVerbose(
                    'provideInlineCompletionItems',
                    'no active editor'
                )
                autoeditAnalyticsLogger.markAsDiscarded({
                    requestId,
                    discardReason: autoeditDiscardReason.noActiveEditor,
                })
                return null
            }

            // Save metadata required for the agent API calls.
            // `this.unstable_handleDidShowCompletionItem` can't receive anything apart from the `requestId`
            // because the agent does not know anything about our internal state.
            // We need to ensure all the relevant metadata can be retrieved from `requestId` only.
            autoeditAnalyticsLogger.markAsPostProcessed({
                requestId,
                prediction: updatedPrediction,
                decorationInfo: updatedDecorationInfo,
                inlineCompletionItems,
            })

            if (!isRunningInsideAgent()) {
                // Since VS Code has no callback as to when a completion is shown, we assume
                // that if we pass the above visibility tests, the completion is going to be
                // rendered in the UI
                await this.unstable_handleDidShowCompletionItem(requestId)
            }

            if (updatedDecorationInfo) {
                await this.rendererManager.renderInlineDecorations(updatedDecorationInfo)
            }

            // The data structure returned to the agent's from the `autoedits/execute` calls.
            // Note: this is subject to change later once we start working on the agent API.
            const result: AutoeditsResult = {
                items: inlineCompletionItems || [],
                requestId,
                prediction,
                decorationInfo,
            }

            return result
        } catch (error) {
            const errorToReport =
                error instanceof Error
                    ? error
                    : new Error(`provideInlineCompletionItems autoedit error: ${error}`)

            autoeditAnalyticsLogger.logError(errorToReport)
            return null
        }
    }

    /**
     * Called when a suggestion is shown. This API is inspired by the proposed VS Code API of the
     * same name, it's prefixed with `unstable_` to avoid a clash when the new API goes GA.
     */
    public async unstable_handleDidShowCompletionItem(requestId: AutoeditRequestID): Promise<void> {
        autoeditsOutputChannelLogger.logDebug('handleDidShowSuggestion', `"${requestId}"`)
        return this.rendererManager.handleDidShowSuggestion(requestId)
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
