import { type DebouncedFunc, debounce } from 'lodash'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'

import {
    type ChatClient,
    type ClientCapabilities,
    clientCapabilities,
    currentResolvedConfig,
    tokensToChars,
} from '@sourcegraph/cody-shared'

import type { CompletionBookkeepingEvent } from '../completions/analytics-logger'
import { ContextRankingStrategy } from '../completions/context/completions-context-ranker'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { getCurrentDocContext } from '../completions/get-current-doc-context'
import type { AutocompleteEditItem, AutoeditChanges } from '../jsonrpc/agent-protocol'
import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import type { FixupController } from '../non-stop/FixupController'
import type { CodyStatusBar } from '../services/StatusBar'
import type { AutoeditsModelAdapter, AutoeditsPrompt, ModelResponse } from './adapters/base'
import { createAutoeditsModelAdapter } from './adapters/create-adapter'
import {
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
import { autoeditsOutputChannelLogger } from './output-channel-logger'
import { PromptCacheOptimizedV1 } from './prompt/prompt-cache-optimized-v1'
import { type CodeToReplaceData, getCodeToReplaceData } from './prompt/prompt-utils'
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
import type { AutoEditRenderOutput } from './renderer/render-output'
import { type AutoeditRequestManagerParams, RequestManager } from './request-manager'
import { shrinkPredictionUntilSuffix } from './shrink-prediction'
import { SmartThrottleService } from './smart-throttle'
import { areSameUriDocs, isPredictedTextAlreadyInSuffix } from './utils'

const AUTOEDIT_CONTEXT_STRATEGY = 'auto-edit'
const RESET_SUGGESTION_ON_CURSOR_CHANGE_AFTER_INTERVAL_MS = 60 * 1000
const ON_SELECTION_CHANGE_DEFAULT_DEBOUNCE_INTERVAL_MS = 10
export const AUTOEDIT_INITIAL_DEBOUNCE_INTERVAL_MS = 10

interface AutoeditEditItem extends AutocompleteEditItem {
    id: AutoeditRequestID
}

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

    private readonly promptStrategy = new PromptCacheOptimizedV1()
    public readonly filterPrediction = new FilterPredictionBasedOnRecentEdits()
    private readonly contextMixer = new ContextMixer({
        strategyFactory: new DefaultContextStrategyFactory(Observable.of(AUTOEDIT_CONTEXT_STRATEGY)),
        contextRankingStrategy: ContextRankingStrategy.TimeBased,
        dataCollectionEnabled: false,
    })
    private readonly statusBar: CodyStatusBar
    private readonly capabilities: AutoeditClientCapabilities

    constructor(
        chatClient: ChatClient,
        fixupController: FixupController,
        statusBar: CodyStatusBar,
        options: { shouldRenderInline: boolean; allowUsingWebSocket?: boolean }
    ) {
        this.capabilities = this.getClientCapabilities()

        // Initialise the canvas renderer for image generation.
        initImageSuggestionService()
        // If the user is using auto-edit, mark the user as enrolled
        autoeditsOnboarding.markUserAsAutoEditBetaEnrolled()

        autoeditsOutputChannelLogger.logDebug('Constructor', 'Constructing AutoEditsProvider')
        this.modelAdapter = createAutoeditsModelAdapter({
            providerName: autoeditsProviderConfig.provider,
            isChatModel: autoeditsProviderConfig.isChatModel,
            chatClient: chatClient,
            allowUsingWebSocket: options.allowUsingWebSocket,
        })

        this.rendererManager = options.shouldRenderInline
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
                    return null
                }
                remainingThrottleDelay -= AUTOEDIT_INITIAL_DEBOUNCE_INTERVAL_MS
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
                new Promise(resolve => setTimeout(resolve, remainingThrottleDelay)),
            ])

            if (abortSignal.aborted) {
                autoeditsOutputChannelLogger.logDebugIfVerbose(
                    'provideInlineCompletionItems',
                    'aborted during context fetch and the remaining throttle delay'
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
                abortSignal,
            })

            if (abortSignal?.aborted || predictionResult.type === 'aborted') {
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

            const initialPrediction = predictionResult.prediction

            autoeditAnalyticsLogger.markAsLoaded({
                requestId,
                prompt,
                modelResponse: predictionResult,
                payload: {
                    // TODO: make it required
                    source: predictionResult.source ?? autoeditSource.network,
                    isFuzzyMatch: false,
                    prediction: initialPrediction,
                },
            })

            if (throttledRequest.isStale) {
                autoeditsOutputChannelLogger.logDebugIfVerbose(
                    'provideInlineCompletionItems',
                    'throttled request is stale'
                )
                autoeditAnalyticsLogger.markAsDiscarded({
                    requestId,
                    discardReason: autoeditDiscardReason.staleThrottledRequest,
                })
                return null
            }

            if (predictionResult.prediction.length === 0) {
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

            const renderOutput = this.rendererManager.getRenderOutput(
                {
                    requestId,
                    prediction,
                    document,
                    position,
                    docContext,
                    decorationInfo,
                    codeToReplaceData,
                },
                this.capabilities
            )

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

            if ('inlineCompletionItems' in renderOutput) {
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

            return {
                items: [],
                inlineCompletionItems: [],
                decoratedEditItems: [
                    {
                        id: requestId,
                        originalText: codeToReplaceData.codeToRewrite,
                        range: codeToReplaceData.range,
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
        abortSignal,
    }: {
        document: vscode.TextDocument
        position: vscode.Position
        codeToReplaceData: CodeToReplaceData
        prompt: AutoeditsPrompt
        abortSignal: AbortSignal
    }): Promise<ModelResponse> {
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
                        type: 'success',
                        prediction,
                        responseHeaders: {},
                        responseBody: {},
                        requestUrl: autoeditsProviderConfig.url,
                        source: autoeditSource.cache,
                    }
                }
            }
        }

        const requestParams: AutoeditRequestManagerParams = {
            requestUrl: autoeditsProviderConfig.url,
            uri: document.uri.toString(),
            documentVersion: document.version,
            position,
            abortSignal,
        }

        return this.requestManager.request(requestParams, async signal => {
            return this.modelAdapter.getModelResponse({
                url: autoeditsProviderConfig.url,
                model: autoeditsProviderConfig.model,
                prompt,
                codeToRewrite: codeToReplaceData.codeToRewrite,
                userId: (await currentResolvedConfig()).clientState.anonymousUserID,
                isChatModel: autoeditsProviderConfig.isChatModel,
                abortSignal: signal,
            })
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
