import { type DebouncedFunc, debounce } from 'lodash'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'

import { type ChatClient, currentResolvedConfig, tokensToChars } from '@sourcegraph/cody-shared'

import { ContextRankingStrategy } from '../completions/context/completions-context-ranker'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { getCurrentDocContext } from '../completions/get-current-doc-context'
import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import type { FixupController } from '../non-stop/FixupController'
import type { CodyStatusBar } from '../services/StatusBar'

import type { AutoeditsModelAdapter, AutoeditsPrompt, ModelResponse } from './adapters/base'
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
import { initImageSuggestionService } from './renderer/image-gen'
import { AutoEditsInlineRendererManager } from './renderer/inline-manager'
import { AutoEditsDefaultRendererManager, type AutoEditsRendererManager } from './renderer/manager'
import {
    extractAutoEditResponseFromCurrentDocumentCommentTemplate,
    shrinkReplacerTextToCodeToReplaceRange,
} from './renderer/mock-renderer'
import { shrinkPredictionUntilSuffix } from './shrink-prediction'
import { areSameUriDocs, isPredictedTextAlreadyInSuffix } from './utils'

const AUTOEDIT_CONTEXT_STRATEGY = 'auto-edit'
export const AUTOEDIT_TOTAL_DEBOUNCE_INTERVAL = 75
export const AUTOEDIT_CONTEXT_FETCHING_DEBOUNCE_INTERVAL = 25
const RESET_SUGGESTION_ON_CURSOR_CHANGE_AFTER_INTERVAL_MS = 60 * 1000
const ON_SELECTION_CHANGE_DEFAULT_DEBOUNCE_INTERVAL_MS = 15

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

    private readonly promptStrategy = new ShortTermPromptStrategy()
    public readonly filterPrediction = new FilterPredictionBasedOnRecentEdits()
    private readonly contextMixer = new ContextMixer({
        strategyFactory: new DefaultContextStrategyFactory(Observable.of(AUTOEDIT_CONTEXT_STRATEGY)),
        contextRankingStrategy: ContextRankingStrategy.TimeBased,
        dataCollectionEnabled: false,
    })
    private readonly statusBar: CodyStatusBar

    constructor(
        chatClient: ChatClient,
        fixupController: FixupController,
        statusBar: CodyStatusBar,
        options: { shouldRenderInline: boolean }
    ) {
        // Initialise the canvas renderer for image generation.
        initImageSuggestionService()

        autoeditsOutputChannelLogger.logDebug('Constructor', 'Constructing AutoEditsProvider')
        this.modelAdapter = createAutoeditsModelAdapter({
            providerName: autoeditsProviderConfig.provider,
            isChatModel: autoeditsProviderConfig.isChatModel,
            chatClient: chatClient,
        })

        this.rendererManager = options.shouldRenderInline
            ? new AutoEditsInlineRendererManager(
                  editor => new InlineDiffDecorator(editor),
                  fixupController
              )
            : new AutoEditsDefaultRendererManager(
                  editor => new DefaultDecorator(editor),
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

        this.statusBar = statusBar
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
        let stopLoading: (() => void) | undefined

        try {
            const startedAt = getTimeNowInMillis()
            const controller = new AbortController()
            const abortSignal = controller.signal
            token?.onCancellationRequested(() => controller.abort())

            await new Promise(resolve =>
                setTimeout(resolve, AUTOEDIT_CONTEXT_FETCHING_DEBOUNCE_INTERVAL)
            )
            const remainingDebounceInterval =
                AUTOEDIT_TOTAL_DEBOUNCE_INTERVAL - AUTOEDIT_CONTEXT_FETCHING_DEBOUNCE_INTERVAL
            if (abortSignal.aborted) {
                autoeditsOutputChannelLogger.logDebugIfVerbose(
                    'provideInlineCompletionItems',
                    'debounce aborted AUTOEDIT_CONTEXT_FETCHING_DEBOUNCE_INTERVAL'
                )
                return null
            }

            stopLoading = this.statusBar.addLoader({
                title: 'Auto-edits are being generated',
                timeout: 30_000,
            })

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
            const { codeToRewrite } = codeToReplaceData
            const requestId = autoeditAnalyticsLogger.createRequest({
                startedAt,
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

            autoeditsOutputChannelLogger.logDebugIfVerbose(
                'provideInlineCompletionItems',
                'Calculating context from contextMixer...'
            )
            const [{ context, contextSummary }] = await Promise.all([
                this.contextMixer.getContext({
                    document,
                    position,
                    docContext,
                    maxChars: 32_000,
                }),
                new Promise(resolve => setTimeout(resolve, remainingDebounceInterval)),
            ])

            if (abortSignal.aborted) {
                autoeditsOutputChannelLogger.logDebugIfVerbose(
                    'provideInlineCompletionItems',
                    'aborted during context fetch debounce'
                )
                return null
            }
            autoeditAnalyticsLogger.markAsContextLoaded({
                requestId,
                payload: { contextSummary },
            })

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
            const predictionResult = await this.getPrediction({
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

            if (!predictionResult || predictionResult.prediction.length === 0) {
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

            const initialPrediction = predictionResult.prediction

            autoeditAnalyticsLogger.markAsLoaded({
                requestId,
                prompt,
                modelResponse: predictionResult,
                payload: {
                    source: autoeditSource.network,
                    isFuzzyMatch: false,
                    prediction: initialPrediction,
                },
            })
            autoeditsOutputChannelLogger.logDebug(
                'provideInlineCompletionItems',
                `"${requestId}" ============= Response:\n${initialPrediction}\n` +
                    `============= Time Taken: ${getTimeNowInMillis() - startedAt}ms`
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

            const renderOutput = this.rendererManager.getRenderOutput({
                requestId,
                prediction,
                document,
                position,
                docContext,
                decorationInfo,
                codeToReplaceData,
            })

            if (renderOutput.type === 'none') {
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
                renderOutput,
                prediction:
                    'updatedPrediction' in renderOutput ? renderOutput.updatedPrediction : prediction,
                decorationInfo:
                    'updatedDecorationInfo' in renderOutput
                        ? renderOutput.updatedDecorationInfo
                        : decorationInfo,
            })

            if (!isRunningInsideAgent()) {
                // Since VS Code has no callback as to when a completion is shown, we assume
                // that if we pass the above visibility tests, the completion is going to be
                // rendered in the UI
                await this.unstable_handleDidShowCompletionItem(requestId)
            }

            if ('decorations' in renderOutput) {
                await this.rendererManager.renderInlineDecorations(
                    decorationInfo,
                    renderOutput.decorations
                )
            } else if (renderOutput.type === 'legacy-decorations') {
                await this.rendererManager.renderInlineDecorations(decorationInfo)
            }

            // The data structure returned to the agent's from the `autoedits/execute` calls.
            // Note: this is subject to change later once we start working on the agent API.
            const result: AutoeditsResult = {
                items: 'inlineCompletionItems' in renderOutput ? renderOutput.inlineCompletionItems : [],
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

            if (process.env.NODE_ENV === 'development') {
                console.error(errorToReport)
            }

            autoeditAnalyticsLogger.logError(errorToReport)
            return null
        } finally {
            stopLoading?.()
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
    }): Promise<ModelResponse | undefined> {
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
                    return {
                        prediction,
                        responseHeaders: {},
                        requestUrl: autoeditsProviderConfig.url,
                    }
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
