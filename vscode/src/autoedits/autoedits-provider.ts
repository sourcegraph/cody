import { type DebouncedFunc, debounce } from 'lodash'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'

import { type Attributes, metrics } from '@opentelemetry/api'
import type { Histogram } from '@opentelemetry/api'
import {
    type ChatClient,
    type ClientCapabilities,
    type DocumentContext,
    clientCapabilities,
    currentResolvedConfig,
    tokensToChars,
} from '@sourcegraph/cody-shared'
import type { CompletionBookkeepingEvent } from '../completions/analytics-logger'
import { ContextRankingStrategy } from '../completions/context/completions-context-ranker'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { getCurrentDocContext } from '../completions/get-current-doc-context'
import { getNewLineChar } from '../completions/text-processing'
import { defaultVSCodeExtensionClient } from '../extension-client'
import type { AutocompleteEditItem, AutoeditChanges } from '../jsonrpc/agent-protocol'
import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import type { FixupController } from '../non-stop/FixupController'
import type { CodyStatusBar } from '../services/StatusBar'
import type {
    AbortedModelResponse,
    AutoeditsModelAdapter,
    AutoeditsPrompt,
    PartialModelResponse,
    SuccessModelResponse,
} from './adapters/base'
import { createAutoeditsModelAdapter } from './adapters/create-adapter'
import {
    type AutoeditCacheID,
    type AutoeditHotStreakID,
    type AutoeditRequestID,
    type AutoeditRequestStateForAgentTesting,
    autoeditAnalyticsLogger,
    autoeditDiscardReason,
    autoeditSource,
    autoeditTriggerKind,
    getTimeNowInMillis,
} from './analytics-logger'
import { AutoeditCompletionItem } from './autoedit-completion-item'
import { autoeditsOnboarding } from './autoedit-onboarding'
import { autoeditsProviderConfig } from './autoedits-config'
import { FilterPredictionBasedOnRecentEdits } from './filter-prediction-edits'
import { type ProcessedHotStreakResponse, processHotStreakResponses } from './hot-streak'
import { createMockResponseGenerator } from './mock-response-generator'
import { autoeditsOutputChannelLogger } from './output-channel-logger'
import type { AutoeditsUserPromptStrategy } from './prompt/base'
import { createPromptProvider } from './prompt/create-prompt-provider'
import { type CodeToReplaceData, getCodeToReplaceData } from './prompt/prompt-utils'
import { getCurrentFilePath } from './prompt/prompt-utils'
import type { DecorationInfo } from './renderer/decorators/base'
import { DefaultDecorator } from './renderer/decorators/default-decorator'
import { InlineDiffDecorator } from './renderer/decorators/inline-diff-decorator'
import { getAddedLines, getDecorationInfo } from './renderer/diff-utils'
import { initImageSuggestionService } from './renderer/image-gen'
import { AutoEditsInlineRendererManager } from './renderer/inline-manager'
import { AutoEditsDefaultRendererManager, type AutoEditsRendererManager } from './renderer/manager'
import {
    extractAutoEditResponseFromCurrentDocumentCommentTemplate,
    shrinkReplacerTextToCodeToReplaceRange,
} from './renderer/mock-renderer'
import { NextCursorManager } from './renderer/next-cursor-manager'
import type { AutoEditRenderOutput } from './renderer/render-output'
import { type AutoeditRequestManagerParams, RequestManager } from './request-manager'
import { shrinkPredictionUntilSuffix } from './shrink-prediction'
import { SmartThrottleService } from './smart-throttle'
import { areSameUriDocs, isDuplicatingTextFromRewriteArea } from './utils'

const AUTOEDIT_CONTEXT_STRATEGY = 'auto-edit'
const RESET_SUGGESTION_ON_CURSOR_CHANGE_AFTER_INTERVAL_MS = 60 * 1000
const ON_SELECTION_CHANGE_DEFAULT_DEBOUNCE_INTERVAL_MS = 10
export const AUTOEDIT_INITIAL_DEBOUNCE_INTERVAL_MS = 10

interface AutoeditEditItem extends AutocompleteEditItem {
    id: AutoeditRequestID
}

export interface AbortedPredictionResult {
    type: 'aborted'
    response: AbortedModelResponse
}

/* A prediction result that has no valid changes to use */
export interface IgnoredPredictionResult {
    type: 'ignored'
    response: SuccessModelResponse | PartialModelResponse
}

export interface SuggestedPredictionResult {
    type: 'suggested'
    response: SuccessModelResponse | PartialModelResponse
    /**
     * Cache ID for this prediction.
     * Allows us to reliably eject this from the cache when accepted/rejected.
     */
    cacheId: AutoeditCacheID
    /**
     * Hot streak ID for this prediction.
     * If present, means this prediction is part of a hot-streak.
     * Used to support jumping between hot-streak suggestions after acceptance.
     */
    hotStreakId?: AutoeditHotStreakID
    /**
     * Document URI where this prediction was generated.
     */
    uri: string
    /**
     * Edit position for this prediction.
     * This is the location of the first change in the prediction.
     * This is used to provide "next cursor" suggestions
     */
    editPosition: vscode.Position
    /**
     * Document context for this prediction.
     * This may differ from the original document context if the prediction is a hot-streak.
     */
    docContext: DocumentContext
    /**
     * Code to replace data for this prediction.
     * This may differ from the original code to replace data if the prediction is a hot-streak.
     */
    codeToReplaceData: CodeToReplaceData
}

export type PredictionResult =
    | SuggestedPredictionResult
    | IgnoredPredictionResult
    | AbortedPredictionResult

export interface AutoeditsResult {
    /** @deprecated Use `inlineCompletionItems` instead. */
    items: AutoeditCompletionItem[]
    inlineCompletionItems: AutoeditCompletionItem[]
    decoratedEditItems: AutoeditEditItem[]
    completionEvent?: CompletionBookkeepingEvent
}

export type AutoeditClientCapabilities = Pick<
    ClientCapabilities,
    'autoedit' | 'autoeditInlineDiff' | 'autoeditAsideDiff'
>

interface AutoeditsFeatures {
    shouldRenderInline: boolean
    shouldHotStreak: boolean
    allowUsingWebSocket: boolean
}

type SuggestionStatus = 'success' | 'error' | 'aborted' | 'discarded'
type AbortReason = 'throttle' | 'contextFetch'
type SuggestionUnsuccessfulReason = AbortReason | keyof typeof autoeditDiscardReason

interface SuggestionLatencyMetricAttributes extends Attributes {
    status: SuggestionStatus
    reason?: SuggestionUnsuccessfulReason
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
    private lastManualTriggerTimestamp = Number.MIN_SAFE_INTEGER

    private readonly onSelectionChangeDebounced: DebouncedFunc<typeof this.onSelectionChange>

    public readonly rendererManager: AutoEditsRendererManager
    private readonly modelAdapter: AutoeditsModelAdapter
    private readonly requestManager = new RequestManager()
    public readonly smartThrottleService = new SmartThrottleService()
    protected nextCursorManager = new NextCursorManager()

    private readonly promptStrategy: AutoeditsUserPromptStrategy
    public readonly filterPrediction = new FilterPredictionBasedOnRecentEdits()
    private readonly contextMixer = new ContextMixer({
        strategyFactory: new DefaultContextStrategyFactory(Observable.of(AUTOEDIT_CONTEXT_STRATEGY)),
        contextRankingStrategy: ContextRankingStrategy.TimeBased,
        dataCollectionEnabled: false,
    })
    private readonly statusBar: CodyStatusBar
    private readonly capabilities: AutoeditClientCapabilities
    private readonly features: AutoeditsFeatures
    private suggestionLatencyMetric: Histogram<SuggestionLatencyMetricAttributes>
    private modelCallLatencyMetric: Histogram<{
        adapter: string
        model: string
    }>

    constructor(
        chatClient: ChatClient,
        fixupController: FixupController,
        statusBar: CodyStatusBar,
        features: AutoeditsFeatures
    ) {
        this.capabilities = this.getClientCapabilities()
        this.features = features

        // Initialise the canvas renderer for image generation.
        initImageSuggestionService()
        // If the user is using auto-edit, mark the user as enrolled
        autoeditsOnboarding.markUserAsAutoEditBetaEnrolled()

        autoeditsOutputChannelLogger.logDebug('Constructor', 'Constructing AutoEditsProvider')

        this.promptStrategy = createPromptProvider({
            promptProvider: autoeditsProviderConfig.promptProvider,
        })

        this.modelAdapter = createAutoeditsModelAdapter({
            providerName: autoeditsProviderConfig.provider,
            isChatModel: autoeditsProviderConfig.isChatModel,
            chatClient: chatClient,
            allowUsingWebSocket: this.features.allowUsingWebSocket,
        })

        this.rendererManager = this.features.shouldRenderInline
            ? new AutoEditsInlineRendererManager(
                  editor => new InlineDiffDecorator(editor),
                  fixupController,
                  this.requestManager
              )
            : new AutoEditsDefaultRendererManager(
                  editor => new DefaultDecorator(editor),
                  fixupController,
                  this.requestManager
              )

        this.onSelectionChangeDebounced = debounce(
            (event: vscode.TextEditorSelectionChangeEvent) => this.onSelectionChange(event),
            ON_SELECTION_CHANGE_DEFAULT_DEBOUNCE_INTERVAL_MS
        )

        this.disposables.push(
            this.requestManager,
            this.contextMixer,
            this.rendererManager,
            this.modelAdapter,
            vscode.window.onDidChangeTextEditorSelection(this.onSelectionChangeDebounced),
            vscode.workspace.onDidChangeTextDocument(event => {
                this.onDidChangeTextDocument(event)
            })
        )

        const meter = metrics.getMeter('autoedit', defaultVSCodeExtensionClient().clientVersion)

        this.suggestionLatencyMetric = meter.createHistogram<SuggestionLatencyMetricAttributes>(
            'autoedit.suggestion.latency',
            {
                description: 'Autoedit suggestion latency',
                unit: 'ms',
            }
        )
        this.modelCallLatencyMetric = meter.createHistogram<{
            adapter: string
            model: string
        }>('autoedit.model.call.latency', {
            description: 'Autoedit model call latency',
            unit: 'ms',
        })

        this.statusBar = statusBar
    }

    private getClientCapabilities(): AutoeditClientCapabilities {
        const inAgent = isRunningInsideAgent()
        if (!inAgent) {
            // We are running inside VS Code
            return {
                autoedit: 'enabled',
                autoeditAsideDiff: 'image',
                autoeditInlineDiff: 'insertions-and-deletions',
            }
        }

        const capabilitiesFromClient = clientCapabilities()
        return {
            autoedit: capabilitiesFromClient.autoedit,
            autoeditAsideDiff: capabilitiesFromClient.autoeditAsideDiff,
            autoeditInlineDiff: capabilitiesFromClient.autoeditInlineDiff,
        }
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        if (event.document.uri.scheme === 'file') {
            this.lastTextChangeTimeStamp = performance.now()
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
            performance.now() - this.lastTextChangeTimeStamp <
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
        const startedAt = getTimeNowInMillis()

        if (inlineCompletionContext.selectedCompletionInfo !== undefined) {
            const { range, text } = inlineCompletionContext.selectedCompletionInfo
            const completion = new AutoeditCompletionItem({ id: null, insertText: text, range })
            // User has a currently selected item in the autocomplete widget.
            // Instead of attempting to suggest an auto-edit, just show the selected item
            // as the completion. This is to avoid an undesirable edit conflicting with the acceptance
            // of the item shown in the widget.
            // TODO: We should consider the optimal solution here, it may be better to show an
            // inline completion (not an edit) that includes the currently selected item.
            return {
                items: [completion],
                inlineCompletionItems: [completion],
                decoratedEditItems: [],
            }
        }

        try {
            stopLoading = this.statusBar.addLoader({
                title: 'Auto-edits are being generated',
                timeout: 5_000,
            })

            const throttledRequest = this.smartThrottleService.throttle({
                uri: document.uri.toString(),
                position,
                isManuallyTriggered: this.lastManualTriggerTimestamp > performance.now() - 50,
            })

            const abortSignal = throttledRequest.abortController.signal

            let remainingThrottleDelay = throttledRequest.delayMs
            if (throttledRequest.delayMs > AUTOEDIT_INITIAL_DEBOUNCE_INTERVAL_MS) {
                await new Promise(resolve => setTimeout(resolve, AUTOEDIT_INITIAL_DEBOUNCE_INTERVAL_MS))
                if (abortSignal.aborted) {
                    autoeditsOutputChannelLogger.logDebugIfVerbose(
                        'provideInlineCompletionItems',
                        `debounce aborted during first ${AUTOEDIT_INITIAL_DEBOUNCE_INTERVAL_MS}ms of throttle`
                    )
                    this.suggestionLatencyMetric.record(getTimeNowInMillis() - startedAt, {
                        status: 'aborted',
                        reason: 'throttle',
                    })
                    return null
                }
                remainingThrottleDelay -= AUTOEDIT_INITIAL_DEBOUNCE_INTERVAL_MS
            }

            autoeditsOutputChannelLogger.logDebugIfVerbose(
                'provideInlineCompletionItems',
                'Calculating getCurrentDocContext...'
            )

            // Determine the document context for this specific request
            // This may differ from `predictionDocContext` if we retrieve it from the cache
            // or if we have a hot-streak prediction.
            const requestDocContext = getCurrentDocContext({
                document,
                position,
                maxPrefixLength: tokensToChars(autoeditsProviderConfig.tokenLimit.prefixTokens),
                maxSuffixLength: tokensToChars(autoeditsProviderConfig.tokenLimit.suffixTokens),
            })

            // Determine the code to replace for this specific request
            // This may differ from `predictionCodeToReplaceData` if we retrieve it from the cache
            // or if we have a hot-streak prediction.
            const requestCodeToReplaceData = getCodeToReplaceData({
                docContext: requestDocContext,
                document,
                position,
                tokenBudget: autoeditsProviderConfig.tokenLimit,
            })
            const requestId = autoeditAnalyticsLogger.createRequest({
                startedAt,
                filePath: getCurrentFilePath(document).toString(),
                codeToReplaceData: requestCodeToReplaceData,
                position,
                docContext: requestDocContext,
                document,
                payload: {
                    languageId: document.languageId,
                    model: autoeditsProviderConfig.model,
                    codeToRewrite: requestCodeToReplaceData.codeToRewrite,
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
                    docContext: requestDocContext,
                    maxChars: 32_000,
                }),
                new Promise(resolve => setTimeout(resolve, remainingThrottleDelay)),
            ])

            if (abortSignal.aborted) {
                autoeditsOutputChannelLogger.logDebugIfVerbose(
                    'provideInlineCompletionItems',
                    'aborted during context fetch and the remaining throttle delay'
                )
                this.suggestionLatencyMetric.record(getTimeNowInMillis() - startedAt, {
                    status: 'aborted',
                    reason: 'contextFetch',
                })
                return null
            }
            autoeditAnalyticsLogger.markAsContextLoaded({
                requestId,
                context,
                payload: { contextSummary },
            })

            autoeditsOutputChannelLogger.logDebugIfVerbose(
                'provideInlineCompletionItems',
                'Calculating prompt from promptStrategy...'
            )
            const prompt = this.promptStrategy.getPromptForModelType({
                document,
                codeToReplaceData: requestCodeToReplaceData,
                context,
                tokenBudget: autoeditsProviderConfig.tokenLimit,
                isChatModel: autoeditsProviderConfig.isChatModel,
            })

            autoeditsOutputChannelLogger.logDebugIfVerbose(
                'provideInlineCompletionItems',
                'Calculating prediction from getPrediction...'
            )
            const predictionResult = await this.getPrediction({
                requestId,
                document,
                position,
                prompt,
                codeToReplaceData: requestCodeToReplaceData,
                docContext: requestDocContext,
                abortSignal,
            })

            if (abortSignal?.aborted || predictionResult.type === 'aborted') {
                this.discardSuggestion({
                    startedAt,
                    requestId,
                    discardReason: 'clientAborted',
                })
                return null
            }

            if (predictionResult.type === 'ignored') {
                this.discardSuggestion({
                    startedAt,
                    requestId,
                    discardReason: 'predictionEqualsCodeToRewrite',
                })
                return null
            }

            if (this.shouldDeferToNextCursorSuggestion({ prediction: predictionResult, position })) {
                this.discardSuggestion({
                    startedAt,
                    requestId,
                    discardReason: 'nextCursorSuggestionShownInstead',
                })
                this.nextCursorManager.suggest(document.uri, predictionResult.editPosition)
                return null
            }

            const initialPrediction = predictionResult.response.prediction
            const predictionDocContext = predictionResult.docContext
            const predictionCodeToReplaceData = predictionResult.codeToReplaceData

            autoeditAnalyticsLogger.markAsLoaded({
                requestId,
                cacheId: predictionResult.cacheId,
                hotStreakId: predictionResult.hotStreakId,
                prompt,
                modelResponse: predictionResult.response,
                docContext: predictionDocContext,
                codeToReplaceData: predictionCodeToReplaceData,
                editPosition: predictionResult.editPosition,
                payload: {
                    // TODO: make it required
                    source: predictionResult.response.source ?? autoeditSource.network,
                    isFuzzyMatch: false,
                    prediction: initialPrediction,
                    codeToRewrite: predictionCodeToReplaceData.codeToRewrite,
                },
            })

            if (throttledRequest.isStale) {
                this.discardSuggestion({
                    startedAt,
                    requestId,
                    discardReason: 'staleThrottledRequest',
                    prediction: initialPrediction,
                })
                return null
            }

            if (predictionResult.response.prediction.length === 0) {
                this.discardSuggestion({
                    startedAt,
                    requestId,
                    discardReason: 'emptyPrediction',
                    prediction: initialPrediction,
                })
                return null
            }

            autoeditsOutputChannelLogger.logDebug(
                'provideInlineCompletionItems',
                `"${requestId}" ============= Response:\n${initialPrediction}\n` +
                    `============= Time Taken: ${getTimeNowInMillis() - startedAt}ms`
            )

            const prediction = shrinkPredictionUntilSuffix({
                prediction: initialPrediction,
                codeToReplaceData: predictionCodeToReplaceData,
            })

            if (prediction === predictionCodeToReplaceData.codeToRewrite) {
                this.discardSuggestion({
                    startedAt,
                    requestId,
                    discardReason: 'predictionEqualsCodeToRewrite',
                    prediction: initialPrediction,
                })
                return null
            }

            const shouldFilterPredictionBasedRecentEdits = this.filterPrediction.shouldFilterPrediction({
                uri: document.uri,
                prediction,
                codeToRewrite: predictionCodeToReplaceData.codeToRewrite,
            })

            if (shouldFilterPredictionBasedRecentEdits) {
                this.discardSuggestion({
                    startedAt,
                    requestId,
                    discardReason: 'recentEdits',
                    prediction: initialPrediction,
                })
                return null
            }

            const decorationInfo = getDecorationInfoFromPrediction(
                document,
                prediction,
                predictionCodeToReplaceData.range
            )

            if (
                isDuplicatingTextFromRewriteArea({
                    addedText: getAddedLines(decorationInfo)
                        .map(line => line.text)
                        .join(getNewLineChar(predictionCodeToReplaceData.codeToRewrite)),
                    codeToReplaceData: predictionCodeToReplaceData,
                })
            ) {
                this.discardSuggestion({
                    startedAt,
                    requestId,
                    discardReason: 'rewriteAreaOverlap',
                    prediction: initialPrediction,
                })
                return null
            }

            const renderOutput = this.rendererManager.getRenderOutput(
                {
                    requestId,
                    prediction,
                    document,
                    position,
                    docContext: predictionDocContext,
                    decorationInfo,
                    codeToReplaceData: predictionCodeToReplaceData,
                },
                this.capabilities
            )

            if (renderOutput.type === 'none') {
                this.discardSuggestion({
                    startedAt,
                    requestId,
                    discardReason: 'emptyPredictionAfterInlineCompletionExtraction',
                    prediction: initialPrediction,
                })
                return null
            }

            const editor = vscode.window.activeTextEditor
            if (!editor || !areSameUriDocs(document, editor.document)) {
                this.discardSuggestion({
                    startedAt,
                    requestId,
                    discardReason: 'noActiveEditor',
                    prediction: initialPrediction,
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

            if ('inlineCompletionItems' in renderOutput) {
                this.suggestionLatencyMetric.record(getTimeNowInMillis() - startedAt, {
                    status: 'success',
                })
                return {
                    items: renderOutput.inlineCompletionItems,
                    inlineCompletionItems: renderOutput.inlineCompletionItems,
                    decoratedEditItems: [],
                }
            }

            if (!isRunningInsideAgent()) {
                // If we are in VS Code there is nothing more we can do here. The decorations will be shown
                // via the decorator.
                return null
            }

            if (this.capabilities.autoedit !== 'enabled') {
                // We are running inside the agent, but the client does not support auto-edits.
                return null
            }

            this.suggestionLatencyMetric.record(getTimeNowInMillis() - startedAt, {
                status: 'success',
            })

            return {
                items: [],
                inlineCompletionItems: [],
                decoratedEditItems: [
                    {
                        id: requestId,
                        originalText: predictionCodeToReplaceData.codeToRewrite,
                        range: predictionCodeToReplaceData.range,
                        insertText: prediction,
                        render: {
                            inline: {
                                changes: this.getTextDecorationsForClient(renderOutput),
                            },
                            aside: {
                                image: renderOutput.type === 'image' ? renderOutput.imageData : null,
                                diff: renderOutput.type === 'custom' ? decorationInfo : null,
                            },
                        },
                    },
                ],
            }
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

    private getTextDecorationsForClient(renderOutput: AutoEditRenderOutput): AutoeditChanges[] | null {
        const decorations = 'decorations' in renderOutput ? renderOutput.decorations : null
        if (!decorations) {
            return null
        }

        // Handle based on client capabilities
        switch (this.capabilities.autoeditInlineDiff) {
            case 'none':
                return null
            case 'insertions-only':
                if (decorations.insertionDecorations.length === 0) {
                    return null
                }
                return decorations.insertionDecorations.map(decoration => ({
                    type: 'insert',
                    range: decoration.range,
                    text: decoration.text,
                }))
            case 'deletions-only':
                if (decorations.deletionDecorations.length === 0) {
                    return null
                }
                return decorations.deletionDecorations.map(decoration => ({
                    type: 'delete',
                    range: decoration.range,
                    text: decoration.text,
                }))
            case 'insertions-and-deletions': {
                const output: AutoeditChanges[] = []
                if (decorations.insertionDecorations.length > 0) {
                    output.push(
                        ...decorations.insertionDecorations.map(decoration => ({
                            type: 'insert' as const,
                            range: decoration.range,
                            text: decoration.text,
                        }))
                    )
                }
                if (decorations.deletionDecorations.length > 0) {
                    output.push(
                        ...decorations.deletionDecorations.map(decoration => ({
                            type: 'delete' as const,
                            range: decoration.range,
                            text: decoration.text,
                        }))
                    )
                }
                if (output.length === 0) {
                    return null
                }
                return output.sort((a, b) => a.range.start.compareTo(b.range.start))
            }
            default:
                return null
        }
    }

    private discardSuggestion({
        startedAt,
        discardReason,
        requestId,
        prediction,
    }: {
        requestId: AutoeditRequestID
        startedAt: number
        discardReason: keyof typeof autoeditDiscardReason
        prediction?: string
    }) {
        autoeditsOutputChannelLogger.logDebugIfVerbose(
            'provideInlineCompletionItems',
            `discarded because ${discardReason}`
        )
        autoeditAnalyticsLogger.markAsDiscarded({
            requestId,
            discardReason: autoeditDiscardReason[discardReason],
            prediction,
        })
        this.suggestionLatencyMetric.record(getTimeNowInMillis() - startedAt, {
            status: 'discarded',
            reason: discardReason,
        })
    }

    /**
     * Called when a suggestion is shown. This API is inspired by the proposed VS Code API of the
     * same name, it's prefixed with `unstable_` to avoid a clash when the new API goes GA.
     */
    public async unstable_handleDidShowCompletionItem(requestId: AutoeditRequestID): Promise<void> {
        autoeditsOutputChannelLogger.logDebug('handleDidShowSuggestion', `"${requestId}"`)
        return this.rendererManager.handleDidShowSuggestion(requestId)
    }

    /**
     * Process model responses and emit hot streak predictions
     * This allows us to emit suggestions before the model is done generating
     */
    private async getAndProcessModelResponses({
        document,
        position,
        codeToReplaceData,
        docContext,
        prompt,
        abortSignal,
    }: {
        document: vscode.TextDocument
        position: vscode.Position
        codeToReplaceData: CodeToReplaceData
        docContext: DocumentContext
        prompt: AutoeditsPrompt
        abortSignal: AbortSignal
    }): Promise<AsyncGenerator<ProcessedHotStreakResponse>> {
        const userId = (await currentResolvedConfig()).clientState.anonymousUserID
        const responseGenerator = await this.modelAdapter.getModelResponse({
            url: autoeditsProviderConfig.url,
            model: autoeditsProviderConfig.model,
            prompt,
            codeToRewrite: codeToReplaceData.codeToRewrite,
            userId,
            isChatModel: autoeditsProviderConfig.isChatModel,
            abortSignal,
            timeoutMs: autoeditsProviderConfig.timeoutMs,
        })

        return processHotStreakResponses({
            responseGenerator,
            document,
            codeToReplaceData,
            docContext,
            position,
            options: {
                hotStreakEnabled: this.features.shouldHotStreak,
            },
        })
    }

    private async getPrediction({
        requestId,
        document,
        position,
        codeToReplaceData,
        docContext,
        prompt,
        abortSignal,
    }: {
        requestId: AutoeditRequestID
        document: vscode.TextDocument
        position: vscode.Position
        codeToReplaceData: CodeToReplaceData
        docContext: DocumentContext
        prompt: AutoeditsPrompt
        abortSignal: AbortSignal
    }): Promise<PredictionResult> {
        const requestParams: AutoeditRequestManagerParams = {
            requestId,
            requestUrl: autoeditsProviderConfig.url,
            documentUri: document.uri.toString(),
            documentText: document.getText(),
            documentVersion: document.version,
            codeToReplaceData,
            docContext,
            position,
            abortSignal,
        }

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
                    const responseGenerator = createMockResponseGenerator(prediction)
                    return this.requestManager.request(requestParams, async signal => {
                        return processHotStreakResponses({
                            responseGenerator,
                            document,
                            codeToReplaceData,
                            docContext,
                            position,
                            options: {
                                hotStreakEnabled: this.features.shouldHotStreak,
                            },
                        })
                    })
                }
            }
        }

        return this.requestManager.request(requestParams, async signal => {
            const startedAt = getTimeNowInMillis()
            const response = await this.getAndProcessModelResponses({
                document,
                position,
                codeToReplaceData,
                prompt,
                abortSignal: signal,
                docContext,
            })

            this.modelCallLatencyMetric.record(getTimeNowInMillis() - startedAt, {
                adapter: this.modelAdapter.constructor.name,
                model: autoeditsProviderConfig.model,
            })

            return response
        })
    }

    public async manuallyTriggerCompletion(): Promise<void> {
        if (isRunningInsideAgent()) {
            // Client manage their own shortcuts and logic for manually triggering a completion
            return
        }

        await vscode.commands.executeCommand('editor.action.inlineSuggest.hide')
        this.lastManualTriggerTimestamp = performance.now()
        await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
    }

    /**
     * Threshold in which we will prefer to show a next cursor suggeston instead
     * of the current suggestion.
     */
    private NEXT_CURSOR_SUGGESTION_THRESHOLD = 10
    private shouldDeferToNextCursorSuggestion({
        prediction,
        position,
    }: {
        prediction: SuggestedPredictionResult
        position: vscode.Position
    }): boolean {
        const distance = prediction.editPosition.line - position.line
        return distance > this.NEXT_CURSOR_SUGGESTION_THRESHOLD
    }

    public getTestingAutoeditEvent(id: AutoeditRequestID): AutoeditRequestStateForAgentTesting {
        return this.rendererManager.testing_getTestingAutoeditEvent(id)
    }

    /**
     * noop method for Agent compability with `InlineCompletionItemProvider`.
     * See: vscode/src/completions/inline-completion-item-provider.ts
     */
    public clearLastCandidate(): void {
        console.warn('clearLastCandidate is not implemented in AutoeditsProvider')
    }

    /**
     * Added for testing async code in the agent integration tests where we don't have access
     * to the vitest fakeTimers API.
     */
    public get testing_completionSuggestedPromise(): Promise<AutoeditRequestID> | undefined {
        return this.rendererManager.testing_completionSuggestedPromise
    }

    /**
     * Method for agent integration tests to control the completion visibility delay.
     * See: vscode/src/completions/inline-completion-item-provider.ts
     */
    public testing_setCompletionVisibilityDelay(delay: number): void {
        this.rendererManager.testing_setCompletionVisibilityDelay(delay)
    }

    public async handleDidAcceptCompletionItem(id: AutoeditRequestID): Promise<void> {
        return this.rendererManager.handleDidAcceptCompletionItem(id)
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
    range: vscode.Range
): DecorationInfo {
    const currentFileText = document.getText()
    const predictedFileText =
        currentFileText.slice(0, document.offsetAt(range.start)) +
        prediction +
        currentFileText.slice(document.offsetAt(range.end))

    const decorationInfo = getDecorationInfo(currentFileText, predictedFileText)
    return decorationInfo
}
