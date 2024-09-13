import { type DebouncedFunc, debounce } from 'lodash'
import * as vscode from 'vscode'

import {
    ClientConfigSingleton,
    type DocumentContext,
    FeatureFlag,
    RateLimitError,
    contextFiltersProvider,
    createDisposables,
    featureFlagProvider,
    subscriptionDisposable,
    telemetryRecorder,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { logDebug } from '../log'
import { localStorage } from '../services/LocalStorageProvider'

import { type CodyIgnoreType, showCodyIgnoreNotification } from '../cody-ignore/notification'
import { autocompleteStageCounterLogger } from '../services/autocomplete-stage-counter-logger'
import { recordExposedExperimentsToSpan } from '../services/open-telemetry/utils'
import { isInTutorial } from '../tutorial/helpers'
import { type LatencyFeatureFlags, getArtificialDelay, resetArtificialDelay } from './artificial-delay'
import { completionProviderConfig } from './completion-provider-config'
import { ContextMixer } from './context/context-mixer'
import { DefaultContextStrategyFactory } from './context/context-strategy'
import { getCompletionIntent } from './doc-context-getters'
import { FirstCompletionDecorationHandler } from './first-completion-decoration-handler'
import { formatCompletion } from './format-completion'
import { getCurrentDocContext } from './get-current-doc-context'
import {
    type InlineCompletionsParams,
    InlineCompletionsResultSource,
    type LastInlineCompletionCandidate,
    TriggerKind,
    getInlineCompletions,
    shouldCancelBasedOnCurrentLine,
} from './get-inline-completions'
import {
    type CodyCompletionItemProviderConfig,
    type InlineCompletionItemProviderConfig,
    InlineCompletionItemProviderConfigSingleton,
} from './inline-completion-item-provider-config-singleton'
import { isCompletionVisible } from './is-completion-visible'
import type { CompletionBookkeepingEvent, CompletionItemID, CompletionLogID } from './logger'
import * as CompletionLogger from './logger'
import { RequestManager, type RequestParams } from './request-manager'
import {
    canReuseLastCandidateInDocumentContext,
    getRequestParamsFromLastCandidate,
} from './reuse-last-candidate'
import { SmartThrottleService } from './smart-throttle'
import {
    type AutocompleteInlineAcceptedCommandArgs,
    type AutocompleteItem,
    analyticsItemToAutocompleteItem,
    suggestedAutocompleteItemsCache,
    updateInsertRangeForVSCode,
} from './suggested-autocomplete-items-cache'
import { indentation } from './text-processing'
import type { ProvideInlineCompletionItemsTracer, ProvideInlineCompletionsItemTraceData } from './tracer'

interface AutocompleteResult extends vscode.InlineCompletionList {
    logId: CompletionLogID
    items: AutocompleteItem[]
    /** @deprecated */
    completionEvent?: CompletionBookkeepingEvent
}

interface CompletionRequest {
    document: vscode.TextDocument
    position: vscode.Position
    context: vscode.InlineCompletionContext
}

interface PreloadCompletionContext extends vscode.InlineCompletionContext {
    isPreload: true

    // The following fields are required only for compatibility with the `provideInlineCompletionItems` API.
    //
    // I considered creating a separate wrapper method for this, but it's not worth it,
    // since preloading is experimental and we will actively tweak the existing logic based on it.
    //
    // Keeping everything in one place is easier for now.
    triggerKind: 1
    selectedCompletionInfo: undefined
}

export class InlineCompletionItemProvider
    implements vscode.InlineCompletionItemProvider, vscode.Disposable
{
    private latestCompletionRequest: CompletionRequest | null = null
    // This field is going to be set if you use the keyboard shortcut to manually trigger a
    // completion. Since VS Code does not provide a way to distinguish manual vs automatic
    // completions, we use consult this field inside the completion callback instead.
    private lastManualCompletionTimestamp: number | null = null
    // private reportedErrorMessages: Map<string, number> = new Map()

    private requestManager: RequestManager
    private contextMixer: ContextMixer
    private smartThrottleService: SmartThrottleService | null = null

    /** Mockable (for testing only). */
    protected getInlineCompletions = getInlineCompletions

    /** Accessible for testing only. */
    protected lastCandidate: LastInlineCompletionCandidate | undefined

    private lastAcceptedCompletionItem:
        | Pick<AutocompleteItem, 'requestParams' | 'analyticsItem'>
        | undefined

    private disposables: vscode.Disposable[] = []

    private firstCompletionDecoration = new FirstCompletionDecorationHandler()

    /**
     * The evaluated value of {@link FeatureFlag.CodyAutocompleteTracing}, available synchronously
     * because it's used in timing-sensitive code.
     */
    private shouldSample = false

    private get config(): InlineCompletionItemProviderConfig {
        return InlineCompletionItemProviderConfigSingleton.configuration
    }

    constructor({
        completeSuggestWidgetSelection = true,
        triggerDelay = 0,
        formatOnAccept = true,
        disableInsideComments = false,
        tracer = null,
        createBfgRetriever,
        ...config
    }: CodyCompletionItemProviderConfig) {
        // This is a static field to allow for easy access in the static `configuration` getter.
        // There must only be one instance of this class at a time.
        InlineCompletionItemProviderConfigSingleton.set({
            ...config,
            completeSuggestWidgetSelection,
            triggerDelay,
            formatOnAccept,
            disableInsideComments,
            tracer,
            isRunningInsideAgent: config.isRunningInsideAgent ?? false,
            isDotComUser: config.isDotComUser ?? false,
            noInlineAccept: config.noInlineAccept ?? false,
        })

        autocompleteStageCounterLogger.setProviderModel(config.provider.legacyModel)

        this.disposables.push(
            subscriptionDisposable(
                featureFlagProvider
                    .evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteTracing)
                    .subscribe(shouldSample => {
                        this.shouldSample = Boolean(shouldSample)
                    })
            )
        )

        if (this.config.completeSuggestWidgetSelection) {
            // This must be set to true, or else the suggest widget showing will suppress inline
            // completions. Note that the VS Code proposed API inlineCompletionsAdditions contains
            // an InlineCompletionList#suppressSuggestions field that lets an inline completion
            // provider override this on a per-completion basis. Because that API is proposed, we
            // can't use it and must instead resort to writing to the user's VS Code settings.
            //
            // The cody.autocomplete.experimental.completeSuggestWidgetSelection setting is
            // experimental and off by default. Before turning it on by default, we need to try to
            // find a workaround that is not silently updating the user's VS Code settings.
            void vscode.workspace
                .getConfiguration()
                .update(
                    'editor.inlineSuggest.suppressSuggestions',
                    true,
                    vscode.ConfigurationTarget.Global
                )
        }

        this.requestManager = new RequestManager()

        const strategyFactory = new DefaultContextStrategyFactory(
            completionProviderConfig.contextStrategy,
            createBfgRetriever
        )
        this.disposables.push(strategyFactory)

        this.contextMixer = new ContextMixer(strategyFactory)

        this.smartThrottleService = new SmartThrottleService()
        this.disposables.push(this.smartThrottleService)

        // TODO(valery): replace `model_configured_by_site_config` with the actual model ID received from backend.
        logDebug(
            'AutocompleteProvider:initialized',
            `using "${this.config.provider.configSource}": "${this.config.provider.id}::${
                this.config.provider.legacyModel || 'model_configured_by_site_config'
            }"`
        )

        if (!this.config.noInlineAccept) {
            // We don't want to accept and log items when we are doing completion comparison from different models.
            this.disposables.push(
                vscode.commands.registerCommand(
                    'cody.autocomplete.inline.accepted',
                    ({ codyCompletion }: AutocompleteInlineAcceptedCommandArgs) => {
                        void this.handleDidAcceptCompletionItem(codyCompletion)
                    }
                )
            )
        }

        this.disposables.push(
            subscriptionDisposable(
                completionProviderConfig.autocompletePreloadDebounceInterval
                    .pipe(
                        createDisposables(preloadDebounceInterval => {
                            this.onSelectionChangeDebounced = undefined
                            if (preloadDebounceInterval > 0) {
                                this.onSelectionChangeDebounced = debounce(
                                    this.preloadCompletionOnSelectionChange.bind(this),
                                    preloadDebounceInterval
                                )

                                return vscode.window.onDidChangeTextEditorSelection(
                                    this.onSelectionChangeDebounced
                                )
                            }
                            return undefined
                        })
                    )
                    .subscribe({})
            )
        )

        // Warm caches for the config feature configuration to avoid the first completion call
        // having to block on this.
        void ClientConfigSingleton.getInstance().getConfig()
    }

    private onSelectionChangeDebounced:
        | DebouncedFunc<typeof this.preloadCompletionOnSelectionChange>
        | undefined

    // TODO: limit the maximum number of the inflight preload requests.
    private async preloadCompletionOnSelectionChange(
        event: vscode.TextEditorSelectionChangeEvent
    ): Promise<void> {
        const lastSelection = event.selections.at(-1)
        const { document } = event.textEditor

        if (lastSelection?.isEmpty && document.uri.scheme === 'file') {
            const currentLine = document.lineAt(lastSelection.active.line)
            const currentLinePrefix = currentLine.text.slice(0, lastSelection.active.character)
            const currentLineSuffix = currentLine.text.slice(lastSelection.active.character)

            if (
                currentLineSuffix.trim() === '' &&
                !shouldCancelBasedOnCurrentLine({
                    currentLinePrefix,
                    currentLineSuffix,
                    document,
                    position: lastSelection.active,
                })
            ) {
                this.provideInlineCompletionItems(document, lastSelection.active, {
                    isPreload: true,
                    triggerKind: 1,
                    selectedCompletionInfo: undefined,
                })
            } else {
                const nextLineNumber = lastSelection.active.line + 1

                // Ignore out of bounds lines
                if (nextLineNumber >= document.lineCount) {
                    return
                }

                const nextLine = document.lineAt(nextLineNumber)
                const nextLinePosition = new vscode.Position(
                    nextLineNumber,
                    indentation(currentLine.text)
                )

                if (
                    nextLine.text.trim() === '' &&
                    !shouldCancelBasedOnCurrentLine({
                        currentLinePrefix: '',
                        currentLineSuffix: '',
                        document,
                        position: nextLinePosition,
                    })
                ) {
                    this.provideInlineCompletionItems(document, nextLinePosition, {
                        isPreload: true,
                        triggerKind: 1,
                        selectedCompletionInfo: undefined,
                    })
                }
            }
        }
    }

    /** Set the tracer (or unset it with `null`). */
    public setTracer(value: ProvideInlineCompletionItemsTracer | null): void {
        this.config.tracer = value
    }

    private lastCompletionRequestTimestamp = 0

    public async provideInlineCompletionItems(
        document: vscode.TextDocument,
        invokedPosition: vscode.Position,
        invokedContext: vscode.InlineCompletionContext | PreloadCompletionContext,
        // Making it optional here to execute multiple suggestion in parallel from the CLI script.
        token?: vscode.CancellationToken
    ): Promise<AutocompleteResult | null> {
        const isPreloadRequest = 'isPreload' in invokedContext
        const spanNamePrefix = isPreloadRequest ? 'preload' : 'provide'
        const startTime = Date.now()
        const triggerDelay = this.config.triggerDelay

        return wrapInActiveSpan(`autocomplete.${spanNamePrefix}InlineCompletionItems`, async span => {
            const stageRecorder = new CompletionLogger.AutocompleteStageRecorder({ isPreloadRequest })

            const isManualCompletion = Boolean(
                this.lastManualCompletionTimestamp &&
                    this.lastManualCompletionTimestamp > Date.now() - 500
            )

            if (await contextFiltersProvider.isUriIgnored(document.uri)) {
                logIgnored(document.uri, 'context-filter', isManualCompletion)
                return null
            }

            // Update the last request
            const lastCompletionRequest = this.latestCompletionRequest
            const completionRequest: CompletionRequest = {
                document,
                position: invokedPosition,
                context: invokedContext,
            }
            this.latestCompletionRequest = completionRequest

            stageRecorder.record('preClientConfigCheck')
            const clientConfig = await ClientConfigSingleton.getInstance().getConfig()

            if (clientConfig && !clientConfig.autoCompleteEnabled) {
                // If ConfigFeatures exists and autocomplete is disabled then raise
                // the error banner for autocomplete config turned off
                const error = new Error('AutocompleteConfigTurnedOff')
                this.onError(error)
                throw error
            }

            if (!this.lastCompletionRequestTimestamp) {
                this.lastCompletionRequestTimestamp = performance.now()
            }

            const tracer = this.config.tracer ? createTracerForInvocation(this.config.tracer) : undefined

            let stopLoading: (() => void) | undefined
            const setIsLoading = (isLoading: boolean): void => {
                if (isLoading && !isPreloadRequest) {
                    // We do not want to show a loading spinner when the user is rate limited to
                    // avoid visual churn.
                    //
                    // We still make the request to find out if the user is still rate limited.
                    const hasRateLimitError = this.config.statusBar.hasError(RateLimitError.errorName)
                    if (!hasRateLimitError) {
                        stopLoading = this.config.statusBar.startLoading(
                            'Completions are being generated',
                            {
                                timeoutMs: 30_000,
                            }
                        )
                    }
                } else {
                    stopLoading?.()
                }
            }

            const abortController = new AbortController()
            let cancellationListener: vscode.Disposable | undefined
            if (token) {
                if (token.isCancellationRequested) {
                    abortController.abort()
                }
                cancellationListener = token.onCancellationRequested(() => abortController.abort())
            }
            stageRecorder.record('preContentPopupCheck')
            // When the user has the completions popup open and an item is selected that does not match
            // the text that is already in the editor, VS Code will never render the completion.
            if (!currentEditorContentMatchesPopupItem(document, invokedContext)) {
                return null
            }

            const takeSuggestWidgetSelectionIntoAccount =
                this.shouldTakeSuggestWidgetSelectionIntoAccount(
                    lastCompletionRequest,
                    completionRequest
                )

            const triggerKind = isPreloadRequest
                ? TriggerKind.Preload
                : isManualCompletion
                  ? TriggerKind.Manual
                  : invokedContext.triggerKind === vscode.InlineCompletionTriggerKind.Automatic
                    ? TriggerKind.Automatic
                    : takeSuggestWidgetSelectionIntoAccount
                      ? TriggerKind.SuggestWidget
                      : TriggerKind.Hover

            this.lastManualCompletionTimestamp = null

            stageRecorder.record('preDocContext')
            let docContext = this.getDocContext(
                document,
                invokedPosition,
                invokedContext,
                takeSuggestWidgetSelectionIntoAccount
            )

            stageRecorder.record('preCompletionIntent')
            const completionIntent = getCompletionIntent({
                document,
                position: invokedPosition,
                prefix: docContext.prefix,
            })

            if (this.config.disableInsideComments && completionIntent === 'comment') {
                return null
            }

            const latencyFeatureFlags: LatencyFeatureFlags = {
                user: await featureFlagProvider.evaluateFeatureFlag(
                    FeatureFlag.CodyAutocompleteUserLatency
                ),
            }

            const artificialDelay = getArtificialDelay(
                latencyFeatureFlags,
                document.uri.toString(),
                document.languageId,
                completionIntent
            )

            const debounceInterval = this.config.provider.mayUseOnDeviceInference ? 125 : 75
            stageRecorder.record('preGetInlineCompletions')

            try {
                // We cannot rely on `position` and `context` being accurate after this request is
                // completed, so we support reassinging them later.
                let position: vscode.Position = invokedPosition
                let context: vscode.InlineCompletionContext | undefined = invokedContext
                const result = await this.getInlineCompletions({
                    document,
                    position,
                    triggerKind,
                    selectedCompletionInfo: context.selectedCompletionInfo,
                    docContext,
                    configuration: this.config.config,
                    provider: this.config.provider,
                    contextMixer: this.contextMixer,
                    smartThrottleService: this.smartThrottleService,
                    requestManager: this.requestManager,
                    lastCandidate: this.lastCandidate,
                    debounceInterval: {
                        singleLine: debounceInterval,
                        multiLine: debounceInterval,
                    },
                    setIsLoading,
                    abortSignal: abortController.signal,
                    cancellationListener,
                    tracer,
                    handleDidAcceptCompletionItem: this.handleDidAcceptCompletionItem.bind(this),
                    handleDidPartiallyAcceptCompletionItem:
                        this.unstable_handleDidPartiallyAcceptCompletionItem.bind(this),
                    completeSuggestWidgetSelection: takeSuggestWidgetSelectionIntoAccount,
                    artificialDelay,
                    firstCompletionTimeout: this.config.firstCompletionTimeout,
                    completionIntent,
                    lastAcceptedCompletionItem: this.lastAcceptedCompletionItem,
                    stageRecorder,
                })

                // Do not increment the `preFinalCancellationCheck` counter if the result is empty.
                // We don't have an opportunity to show a completion if it's empty.
                if (result) {
                    stageRecorder.record('preFinalCancellationCheck')
                }

                // Avoid any further work if the completion is invalidated already or if it's a preload request.
                if (abortController.signal.aborted || isPreloadRequest) {
                    return null
                }

                if (!result) {
                    // Returning null will clear any existing suggestions, thus we need to reset the
                    // last candidate.
                    this.lastCandidate = undefined
                    return null
                }

                if (result.stale) {
                    // Although we have a result, we have marked it as stale which means that we're prioritising
                    // a different result. We want to avoid cases where we run `provideInlineCompletionItems` multiple times
                    // for a single position, so we do nothing here.
                    return null
                }

                const autocompleteItems = analyticsItemToAutocompleteItem(
                    result.logId,
                    document,
                    docContext,
                    position,
                    result.items,
                    context,
                    span
                )

                const latestCursorPosition = vscode.window.activeTextEditor?.selection.active
                if (
                    latestCursorPosition !== undefined &&
                    !latestCursorPosition.isEqual(invokedPosition)
                ) {
                    // The cursor position has changed since the request was made.
                    // This is likely due to another completion request starting, and this request staying in-flight.
                    // We must update the `position`, `context` and associated values
                    position = latestCursorPosition
                    // If the cursor position is the same as the position of the completion request, we should use
                    // the provided context. This allows us to re-use useful information such as `selectedCompletionInfo`
                    context = latestCursorPosition.isEqual(this.latestCompletionRequest.position)
                        ? this.latestCompletionRequest.context
                        : undefined
                    docContext = this.getDocContext(
                        document,
                        position,
                        context,
                        takeSuggestWidgetSelectionIntoAccount
                    )
                }

                // Checks if the current line prefix length is less than or equal to the last triggered prefix length
                // If true, that means user has backspaced/deleted characters to trigger a new completion request,
                // meaning the previous result is unwanted/rejected.
                // In that case, we mark the last candidate as "unwanted", remove it from cache, and clear the last candidate
                const currentPrefix = docContext.currentLinePrefix
                const lastTriggeredPrefix = this.lastCandidate?.lastTriggerDocContext.currentLinePrefix
                if (
                    this.lastCandidate &&
                    // Remove the last candidate from cache only if it can be
                    // used in the current document context.
                    canReuseLastCandidateInDocumentContext({
                        document,
                        position,
                        selectedCompletionInfo: context?.selectedCompletionInfo,
                        lastCandidate: this.lastCandidate,
                        docContext,
                    }) &&
                    lastTriggeredPrefix !== undefined &&
                    // TODO: consider changing this to the trigger point that users observe.
                    // Currently, if the request is synthesized from the inflight requests with an earlier
                    // trigger point, it is used here to decide if users wants to cancel the completion
                    // but it's not obvious to the user where the trigger point is, which makes this
                    // behavior opaque and hard to understand.
                    currentPrefix.length < lastTriggeredPrefix.length
                ) {
                    this.handleUnwantedCompletionItem(
                        getRequestParamsFromLastCandidate(document, this.lastCandidate)
                    )
                }

                const visibleItems = autocompleteItems.filter(item =>
                    isCompletionVisible(
                        item,
                        document,
                        { invokedPosition, latestPosition: position },
                        docContext,
                        context,
                        takeSuggestWidgetSelectionIntoAccount,
                        abortController.signal
                    )
                )

                stageRecorder.record('preVisibilityCheck')

                // A completion that won't be visible in VS Code will not be returned and not be logged.
                if (visibleItems.length === 0) {
                    // Returning null will clear any existing suggestions, thus we need to reset the
                    // last candidate.
                    this.lastCandidate = undefined
                    CompletionLogger.noResponse(result.logId)
                    return null
                }

                // Since we now know that the completion is going to be visible in the UI, we save the
                // completion as the last candidate (that is shown as ghost text in the editor) so that
                // we can reuse it if the user types in such a way that it is still valid (such as by
                // typing `ab` if the ghost text suggests `abcd`).
                if (result.source !== InlineCompletionsResultSource.LastCandidate) {
                    this.lastCandidate = {
                        uri: document.uri,
                        lastTriggerPosition: position,
                        lastTriggerDocContext: docContext,
                        lastTriggerSelectedCompletionInfo: context?.selectedCompletionInfo,
                        result,
                    }
                }

                // Store the log ID for each completion item so that we can later map to the selected
                // item from the ID alone
                for (const item of visibleItems) {
                    suggestedAutocompleteItemsCache.add(item)
                }

                // return `CompletionEvent` telemetry data to the agent command `autocomplete/execute`.
                const autocompleteResult: AutocompleteResult = {
                    logId: result.logId,
                    items: updateInsertRangeForVSCode(visibleItems),
                    completionEvent: CompletionLogger.getCompletionEvent(result.logId),
                }

                if (!this.config.isRunningInsideAgent) {
                    // Since VS Code has no callback as to when a completion is shown, we assume
                    // that if we pass the above visibility tests, the completion is going to be
                    // rendered in the UI
                    this.unstable_handleDidShowCompletionItem(visibleItems[0])
                }

                recordExposedExperimentsToSpan(span)

                // Trigger delay ensures a minimum time before showing autocomplete results.
                // Benefits include:
                // 1. Throttling requests to optimize resource usage
                // 2. Allowing user input to stabilize for more relevant suggestions
                // 3. Creating a consistent, natural-feeling autocomplete experience
                // If the completion response arrives before the delay expires, we wait for the remaining time.
                // If it arrives after, we show the result immediately without additional delay.
                const elapsedTime = Date.now() - startTime
                if (elapsedTime < triggerDelay) {
                    // Wait for the remaining time
                    await new Promise(resolve => setTimeout(resolve, triggerDelay - elapsedTime))
                    if (abortController.signal.aborted) {
                        return null // Exit early if the request has been aborted
                    }
                }
                return autocompleteResult
            } catch (error) {
                this.onError(error as Error)
                throw error
            }
        })
    }

    /**
     * Callback to be called when the user accepts a completion. For VS Code, this is part of the
     * action inside the `AutocompleteItem`. Agent needs to call this callback manually.
     */
    public async handleDidAcceptCompletionItem(
        completionOrItemId:
            | Pick<
                  AutocompleteItem,
                  'range' | 'requestParams' | 'logId' | 'analyticsItem' | 'trackedRange'
              >
            | CompletionItemID
    ): Promise<void> {
        const completion = suggestedAutocompleteItemsCache.get(completionOrItemId)

        if (!completion) {
            return
        }

        if (this.config.formatOnAccept && !this.config.isRunningInsideAgent) {
            await formatCompletion(completion as AutocompleteItem)
        }

        resetArtificialDelay()

        // When a completion is accepted, the lastCandidate should be cleared. This makes sure the
        // log id is never reused if the completion is accepted.
        this.clearLastCandidate()

        // Remove the completion from the network cache
        this.requestManager.removeFromCache(completion.requestParams)

        this.handleFirstCompletionOnboardingNotices(completion.requestParams)

        this.lastAcceptedCompletionItem = completion

        CompletionLogger.accepted(
            completion.logId,
            completion.requestParams.document,
            completion.analyticsItem,
            completion.trackedRange,
            this.config.isDotComUser
        )
    }

    /**
     * Handles showing a notification on the first completion acceptance.
     */
    private handleFirstCompletionOnboardingNotices(request: RequestParams): void {
        const key = 'completion.inline.hasAcceptedFirstCompletion'
        if (localStorage.get(key)) {
            return // Already seen notice.
        }

        // Mark as seen, so we don't show again after this.
        void localStorage.set(key, 'true')

        if (isInTutorial(request.document)) {
            // Do nothing, the user is already working through the tutorial
            return
        }

        // Show inline decoration.
        this.firstCompletionDecoration.show(request)
    }

    public getTestingCompletionEvent(id: CompletionItemID): CompletionBookkeepingEvent | undefined {
        const completion = suggestedAutocompleteItemsCache.get<AutocompleteItem>(id)
        return completion ? CompletionLogger.getCompletionEvent(completion.logId) : undefined
    }

    /**
     * Called when a suggestion is shown. This API is inspired by the proposed VS Code API of the
     * same name, it's prefixed with `unstable_` to avoid a clash when the new API goes GA.
     */
    public unstable_handleDidShowCompletionItem(
        completionOrItemId: AutocompleteItem | CompletionItemID
    ): void {
        const completion = suggestedAutocompleteItemsCache.get(completionOrItemId)
        if (!completion) {
            return
        }
        this.markCompletionAsSuggestedAfterDelay(completion)
    }

    /**
     * The amount of time before we consider a completion to be "visible" to the user.
     */
    private COMPLETION_VISIBLE_DELAY_MS = 750
    private completionSuggestedTimeoutId: NodeJS.Timeout | undefined

    /**
     * Given a completion, fire a suggestion event after a short delay to give the user time to
     * read the completion and decide whether to accept it.
     *
     * Will confirm that the completion is _still_ visible before firing the event.
     */
    public markCompletionAsSuggestedAfterDelay(completion: AutocompleteItem): void {
        const suggestionEvent = CompletionLogger.prepareSuggestionEvent({
            id: completion.logId,
            span: completion.span,
            shouldSample: this.shouldSample,
        })
        if (!suggestionEvent) {
            return
        }
        // Clear any existing timeouts, only one completion can be shown at a time
        clearTimeout(this.completionSuggestedTimeoutId)

        this.completionSuggestedTimeoutId = setTimeout(() => {
            const event = suggestionEvent.getEvent()
            if (!event) {
                return
            }

            if (
                event.suggestedAt === null ||
                event.suggestionAnalyticsLoggedAt !== null ||
                event.suggestionLoggedAt !== null
            ) {
                // Completion was already logged, we do not need to mark it as read
                return
            }

            const { activeTextEditor } = vscode.window
            const { document: invokedDocument, position: invokedPosition } = completion.requestParams

            if (
                !activeTextEditor ||
                activeTextEditor.document.uri.toString() !== invokedDocument.uri.toString()
            ) {
                // User is no longer in the same document as the completion
                return
            }

            const latestCursorPosition = activeTextEditor.selection.active

            // If the cursor position is the same as the position of the completion request, re-use the
            // completion context. This ensures that we still use the suggestion widget to determine if the
            // completion is still visible.
            // We don't have a way of determining the contents of the suggestion widget if the cursor position is different,
            // as this is only provided with `provideInlineCompletionItems` is called.
            const latestContext = latestCursorPosition.isEqual(invokedPosition)
                ? completion.context
                : undefined

            const takeSuggestWidgetSelectionIntoAccount = latestContext
                ? this.shouldTakeSuggestWidgetSelectionIntoAccount(
                      {
                          document: invokedDocument,
                          position: invokedPosition,
                          context: completion.context,
                      },
                      {
                          document: activeTextEditor.document,
                          position: latestCursorPosition,
                          context: latestContext,
                      }
                  )
                : false

            // Confirm that the completion is still visible for the user given the latest
            // cursor position, document and associated values.
            const isStillVisible = isCompletionVisible(
                completion,
                activeTextEditor.document,
                {
                    invokedPosition,
                    latestPosition: activeTextEditor.selection.active,
                },
                this.getDocContext(
                    activeTextEditor.document,
                    activeTextEditor.selection.active,
                    latestContext,
                    takeSuggestWidgetSelectionIntoAccount
                ),
                latestContext,
                takeSuggestWidgetSelectionIntoAccount,
                undefined
            )
            if (isStillVisible) {
                suggestionEvent.markAsRead({
                    document: invokedDocument,
                    position: invokedPosition,
                })
            }
        }, this.COMPLETION_VISIBLE_DELAY_MS)
    }

    /**
     * Only take the completion widget selection into account if the selection was actively changed by the user
     */
    private shouldTakeSuggestWidgetSelectionIntoAccount(
        lastRequest: CompletionRequest | null,
        latestRequest: CompletionRequest
    ): boolean {
        return Boolean(
            this.config.completeSuggestWidgetSelection &&
                lastRequest &&
                onlyCompletionWidgetSelectionChanged(lastRequest, latestRequest)
        )
    }

    /**
     * Called when the user partially accepts a completion. This API is inspired by the proposed VS
     * Code API of the same name, it's prefixed with `unstable_` to avoid a clash when the new API
     * goes GA.
     */
    private unstable_handleDidPartiallyAcceptCompletionItem(
        completion: Pick<AutocompleteItem, 'logId' | 'analyticsItem'>,
        acceptedLength: number
    ): void {
        CompletionLogger.partiallyAccept(
            completion.logId,
            completion.analyticsItem,
            acceptedLength,
            this.config.isDotComUser
        )
    }

    public async manuallyTriggerCompletion(): Promise<void> {
        await vscode.commands.executeCommand('editor.action.inlineSuggest.hide')
        this.lastManualCompletionTimestamp = Date.now()
        await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
    }

    /**
     * Handles when a completion item was rejected by the user.
     *
     * A completion item is marked as rejected/unwanted when:
     * - pressing backspace on a visible suggestion
     */
    private handleUnwantedCompletionItem(reqContext: RequestParams): void {
        const completionItem = this.lastCandidate?.result.items[0]
        if (!completionItem) {
            return
        }

        this.clearLastCandidate()

        this.requestManager.removeFromCache(reqContext)
    }

    /**
     * The user no longer wishes to see the last candidate and requests a new completion. Note this
     * is reset by heuristics when new completion requests are triggered and completions are
     * rejected as a result of that.
     */
    public clearLastCandidate(): void {
        this.lastCandidate = undefined
    }

    /**
     * A callback that is called whenever an error happens. We do not want to flood a users UI with
     * error messages so every unexpected error is deduplicated by its message and rate limit errors
     * are only shown once during the rate limit period.
     */
    private onError(error: Error): void {
        if (error instanceof RateLimitError) {
            // If there's already an existing error, don't add another one.
            const hasRateLimitError = this.config.statusBar.hasError(error.name)
            if (hasRateLimitError) {
                return
            }

            const isEnterpriseUser = this.config.isDotComUser !== true
            const canUpgrade = error.upgradeIsAvailable
            const tier = isEnterpriseUser ? 'enterprise' : canUpgrade ? 'free' : 'pro'

            let errorTitle: string
            let pageName: string
            if (canUpgrade) {
                errorTitle = 'Upgrade to Continue Using Cody Autocomplete'
                pageName = 'upgrade'
            } else {
                errorTitle = 'Cody Autocomplete Disabled Due to Rate Limit'
                pageName = 'rate-limits'
            }
            let shown = false
            this.config.statusBar.addError({
                title: errorTitle,
                description: `${error.userMessage} ${error.retryMessage ?? ''}`.trim(),
                errorType: error.name,
                removeAfterSelected: true,
                removeAfterEpoch: error.retryAfterDate ? Number(error.retryAfterDate) : undefined,
                onSelect: () => {
                    if (canUpgrade) {
                        telemetryRecorder.recordEvent('cody.upsellUsageLimitCTA', 'clicked', {
                            privateMetadata: {
                                limit_type: 'suggestions',
                            },
                        })
                    }
                    void vscode.commands.executeCommand('cody.show-page', pageName)
                },
                onShow: () => {
                    if (shown) {
                        return
                    }
                    shown = true
                    telemetryRecorder.recordEvent(
                        canUpgrade ? 'cody.upsellUsageLimitCTA' : 'cody.abuseUsageLimitCTA',
                        'shown',
                        {
                            privateMetadata: { limit_type: 'suggestions', tier },
                        }
                    )
                },
            })

            telemetryRecorder.recordEvent(
                canUpgrade ? 'cody.upsellUsageLimitStatusBar' : 'cody.abuseUsageLimitStatusBar',
                'shown',
                {
                    privateMetadata: { limit_type: 'suggestions', tier },
                }
            )
            return
        }

        if (error.message === 'AutocompleteConfigTurnedOff') {
            const errorTitle = 'Cody Autocomplete Disabled by Site Admin'
            // If there's already an existing error, don't add another one.
            const hasAutocompleteDisabledBanner = this.config.statusBar.hasError(
                'AutoCompleteDisabledByAdmin'
            )
            if (hasAutocompleteDisabledBanner) {
                return
            }
            let shown = false
            this.config.statusBar.addError({
                title: errorTitle,
                description: 'Contact your Sourcegraph site admin to enable autocomplete',
                errorType: 'AutoCompleteDisabledByAdmin',
                removeAfterSelected: false,
                onShow: () => {
                    if (shown) {
                        return
                    }
                    shown = true
                },
            })
        }
        // TODO(philipp-spiess): Bring back this code once we have fewer uncaught errors
        //
        // c.f. https://sourcegraph.slack.com/archives/C05AGQYD528/p1693471486690459
        //
        // const now = Date.now()
        // if (
        //    this.reportedErrorMessages.has(error.message) &&
        //    this.reportedErrorMessages.get(error.message)! + ONE_HOUR >= now
        // ) {
        //    return
        // }
        // this.reportedErrorMessages.set(error.message, now)
        // this.config.statusBar.addError({
        //    title: 'Cody Autocomplete Encountered an Unexpected Error',
        //    description: error.message,
        //    onSelect: () => {
        //        outputChannel.show()
        //    },
        // })
    }

    private getDocContext(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext | undefined,
        takeSuggestWidgetSelectionIntoAccount: boolean
    ): DocumentContext {
        return getCurrentDocContext({
            document,
            position,
            maxPrefixLength: this.config.provider.contextSizeHints.prefixChars,
            maxSuffixLength: this.config.provider.contextSizeHints.suffixChars,
            // We ignore the current context selection if completeSuggestWidgetSelection is not enabled
            context: takeSuggestWidgetSelectionIntoAccount ? context : undefined,
        })
    }

    public dispose(): void {
        this.onSelectionChangeDebounced?.cancel()

        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}

let globalInvocationSequenceForTracer = 0

/**
 * Creates a tracer for a single invocation of
 * {@link InlineCompletionItemProvider.provideInlineCompletionItems} that accumulates all of the
 * data for that invocation.
 */
function createTracerForInvocation(
    tracer: ProvideInlineCompletionItemsTracer
): InlineCompletionsParams['tracer'] {
    let data: ProvideInlineCompletionsItemTraceData = {
        invocationSequence: ++globalInvocationSequenceForTracer,
    }
    return (update: Partial<ProvideInlineCompletionsItemTraceData>) => {
        data = { ...data, ...update }
        tracer(data)
    }
}

// Check if the current text in the editor overlaps with the currently selected
// item in the completion widget.
//
// If it won't VS Code will never show an inline completions.
//
// Here's an example of how to trigger this case:
//
//  1. Type the text `console.l` in a TypeScript file.
//  2. Use the arrow keys to navigate to a suggested method that start with a
//     different letter like `console.dir`.
//  3. Since it is impossible to render a suggestion with `.dir` when the
//     editor already has `.l` in the text, VS Code won't ever render it.
function currentEditorContentMatchesPopupItem(
    document: vscode.TextDocument,
    context: vscode.InlineCompletionContext
): boolean {
    if (context.selectedCompletionInfo) {
        const currentText = document.getText(context.selectedCompletionInfo.range)
        const selectedText = context.selectedCompletionInfo.text

        if (!selectedText.startsWith(currentText)) {
            return false
        }
    }
    return true
}

/**
 * Returns true if the only difference between the two requests is the selected completions info
 * item from the completions widget.
 */
function onlyCompletionWidgetSelectionChanged(
    prev: CompletionRequest,
    next: CompletionRequest
): boolean {
    if (prev.document.uri.toString() !== next.document.uri.toString()) {
        return false
    }

    if (!prev.position.isEqual(next.position)) {
        return false
    }

    if (prev.context.triggerKind !== next.context.triggerKind) {
        return false
    }

    const prevSelectedCompletionInfo = prev.context.selectedCompletionInfo
    const nextSelectedCompletionInfo = next.context.selectedCompletionInfo

    if (!prevSelectedCompletionInfo || !nextSelectedCompletionInfo) {
        return false
    }

    if (!prevSelectedCompletionInfo.range.isEqual(nextSelectedCompletionInfo.range)) {
        return false
    }

    return prevSelectedCompletionInfo.text !== nextSelectedCompletionInfo.text
}

let lastIgnoredUriLogged: string | undefined = undefined
function logIgnored(uri: vscode.Uri, reason: CodyIgnoreType, isManualCompletion: boolean) {
    // Only show a notification for actively triggered autocomplete requests.
    if (isManualCompletion) {
        showCodyIgnoreNotification('autocomplete', reason)
    }

    const string = uri.toString()
    if (lastIgnoredUriLogged === string) {
        return
    }
    lastIgnoredUriLogged = string
    logDebug(
        'AutocompleteProvider:ignored',
        'Cody is disabled in file ' + uri.toString() + ' (' + reason + ')'
    )
}
