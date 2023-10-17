import { formatDistance } from 'date-fns'
import * as vscode from 'vscode'

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { RateLimitError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'

import { logDebug } from '../log'
import { localStorage } from '../services/LocalStorageProvider'
import { CodyStatusBar } from '../services/StatusBar'

import { getContext, GetContextOptions, GetContextResult } from './context/context'
import { GraphContextFetcher } from './context/context-graph'
import { DocumentHistory } from './context/history'
import { DocumentContext, getCurrentDocContext } from './get-current-doc-context'
import {
    getInlineCompletions,
    InlineCompletionsParams,
    InlineCompletionsResultSource,
    LastInlineCompletionCandidate,
    TriggerKind,
} from './get-inline-completions'
import { getLatency, LatencyFeatureFlags, resetLatency } from './latency'
import * as CompletionLogger from './logger'
import { CompletionEvent, READ_TIMEOUT_MS, SuggestionID } from './logger'
import { ProviderConfig } from './providers/provider'
import { RequestManager, RequestParams } from './request-manager'
import { getRequestParamsFromLastCandidate } from './reuse-last-candidate'
import { InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'
import { ProvideInlineCompletionItemsTracer, ProvideInlineCompletionsItemTraceData } from './tracer'

interface AutocompleteResult extends vscode.InlineCompletionList {
    completionEvent?: CompletionEvent
}

export interface CodyCompletionItemProviderConfig {
    providerConfig: ProviderConfig
    history: DocumentHistory
    statusBar: CodyStatusBar
    getCodebaseContext: () => CodebaseContext
    graphContextFetcher?: GraphContextFetcher | null
    completeSuggestWidgetSelection?: boolean
    tracer?: ProvideInlineCompletionItemsTracer | null
    contextFetcher?: (options: GetContextOptions) => Promise<GetContextResult>
    triggerNotice: ((notice: { key: string }) => void) | null
}

interface CompletionRequest {
    document: vscode.TextDocument
    position: vscode.Position
    context: vscode.InlineCompletionContext
}

export class InlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {
    private lastCompletionRequest: CompletionRequest | null = null
    // This field is going to be set if you use the keyboard shortcut to manually trigger a
    // completion. Since VS Code does not provide a way to distinguish manual vs automatic
    // completions, we use consult this field inside the completion callback instead.
    private lastManualCompletionTimestamp: number | null = null
    // private reportedErrorMessages: Map<string, number> = new Map()
    private resetRateLimitErrorsAfter: number | null = null

    private readonly config: Required<CodyCompletionItemProviderConfig>

    private requestManager: RequestManager

    /** Mockable (for testing only). */
    protected getInlineCompletions = getInlineCompletions

    /** Accessible for testing only. */
    protected lastCandidate: LastInlineCompletionCandidate | undefined

    private isProbablyNewInstall = true

    constructor({
        graphContextFetcher = null,
        completeSuggestWidgetSelection = false,
        tracer = null,
        ...config
    }: CodyCompletionItemProviderConfig) {
        this.config = {
            ...config,
            graphContextFetcher,
            completeSuggestWidgetSelection,
            tracer,
            contextFetcher: config.contextFetcher ?? getContext,
        }

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
                .update('editor.inlineSuggest.suppressSuggestions', true, vscode.ConfigurationTarget.Global)
        }

        this.requestManager = new RequestManager({
            completeSuggestWidgetSelection: this.config.completeSuggestWidgetSelection,
        })

        const chatHistory = localStorage.getChatHistory()?.chat
        this.isProbablyNewInstall = !chatHistory || Object.entries(chatHistory).length === 0

        logDebug(
            'CodyCompletionProvider:initialized',
            [this.config.providerConfig.identifier, this.config.providerConfig.model].join('/')
        )
    }

    /** Set the tracer (or unset it with `null`). */
    public setTracer(value: ProvideInlineCompletionItemsTracer | null): void {
        this.config.tracer = value
    }

    private lastCompletionRequestTimestamp = 0

    public async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        // Making it optional here to execute multiple suggestion in parallel from the CLI script.
        token?: vscode.CancellationToken
    ): Promise<AutocompleteResult | null> {
        // Update the last request
        const lastCompletionRequest = this.lastCompletionRequest
        const completionRequest: CompletionRequest = { document, position, context }
        this.lastCompletionRequest = completionRequest

        const start = performance.now()

        if (!this.lastCompletionRequestTimestamp) {
            this.lastCompletionRequestTimestamp = start
        }

        // We start feature flag requests early so that we have a high chance of getting a response
        // before we need it.
        const [isIncreasedDebounceTimeEnabledPromise, syntacticTriggersPromise, useStreamingTruncation] = [
            featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteIncreasedDebounceTimeEnabled),
            featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteSyntacticTriggers),
            featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteStreamingTruncation),
        ]
        const minLatencyFlagsPromises = {
            user: featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteUserLatency),
            language: featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteLanguageLatency),
            provider: featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteProviderLatency),
        }

        const tracer = this.config.tracer ? createTracerForInvocation(this.config.tracer) : undefined
        const graphContextFetcher = this.config.graphContextFetcher ?? undefined

        let stopLoading: () => void | undefined
        const setIsLoading = (isLoading: boolean): void => {
            if (isLoading) {
                stopLoading = this.config.statusBar.startLoading('Completions are being generated')
            } else {
                stopLoading?.()
            }
        }

        const abortController = new AbortController()
        if (token) {
            if (token.isCancellationRequested) {
                abortController.abort()
            }
            token.onCancellationRequested(() => abortController.abort())
        }

        // When the user has the completions popup open and an item is selected that does not match
        // the text that is already in the editor, VS Code will never render the completion.
        if (!currentEditorContentMatchesPopupItem(document, context)) {
            return null
        }

        let takeSuggestWidgetSelectionIntoAccount = false
        // Only take the completion widget selection into account if the selection was actively changed
        // by the user
        if (
            this.config.completeSuggestWidgetSelection &&
            lastCompletionRequest &&
            onlyCompletionWidgetSelectionChanged(lastCompletionRequest, completionRequest)
        ) {
            takeSuggestWidgetSelectionIntoAccount = true
        }

        const triggerKind =
            this.lastManualCompletionTimestamp && this.lastManualCompletionTimestamp > Date.now() - 500
                ? TriggerKind.Manual
                : context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic
                ? TriggerKind.Automatic
                : takeSuggestWidgetSelectionIntoAccount
                ? TriggerKind.SuggestWidget
                : TriggerKind.Hover
        this.lastManualCompletionTimestamp = null

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: this.config.providerConfig.contextSizeHints.prefixChars,
            maxSuffixLength: this.config.providerConfig.contextSizeHints.suffixChars,
            enableExtendedTriggers: this.config.providerConfig.enableExtendedMultilineTriggers,
            syntacticTriggers: await syntacticTriggersPromise,
            // We ignore the current context selection if completeSuggestWidgetSelection is not enabled
            context: takeSuggestWidgetSelectionIntoAccount ? context : undefined,
        })

        const isIncreasedDebounceTimeEnabled = await isIncreasedDebounceTimeEnabledPromise

        try {
            const result = await this.getInlineCompletions({
                document,
                position,
                triggerKind,
                selectedCompletionInfo: context.selectedCompletionInfo,
                docContext,
                providerConfig: this.config.providerConfig,
                useStreamingTruncation: await useStreamingTruncation,
                graphContextFetcher,
                toWorkspaceRelativePath: uri => vscode.workspace.asRelativePath(uri),
                contextFetcher: this.config.contextFetcher,
                getCodebaseContext: this.config.getCodebaseContext,
                documentHistory: this.config.history,
                requestManager: this.requestManager,
                lastCandidate: this.lastCandidate,
                debounceInterval: { singleLine: isIncreasedDebounceTimeEnabled ? 75 : 25, multiLine: 125 },
                setIsLoading,
                abortSignal: abortController.signal,
                tracer,
                handleDidAcceptCompletionItem: this.handleDidAcceptCompletionItem.bind(this),
                handleDidPartiallyAcceptCompletionItem: this.unstable_handleDidPartiallyAcceptCompletionItem.bind(this),
            })

            // Avoid any further work if the completion is invalidated already.
            if (abortController.signal.aborted) {
                return null
            }

            if (!result) {
                // Returning null will clear any existing suggestions, thus we need to reset the
                // last candidate.
                this.lastCandidate = undefined
                return null
            }

            // Checks if the current line prefix length is less than or equal to the last triggered prefix length
            // If true, that means user has backspaced/deleted characters to trigger a new completion request,
            // meaning the previous result is unwanted/rejected.
            // In that case, we mark the last candidate as "unwanted", remove it from cache, and clear the last candidate
            const currentPrefix = docContext.currentLinePrefix
            const lastTriggeredPrefix = this.lastCandidate?.lastTriggerDocContext.currentLinePrefix
            if (
                this.lastCandidate &&
                lastTriggeredPrefix !== undefined &&
                currentPrefix.length < lastTriggeredPrefix.length
            ) {
                this.handleUnwantedCompletionItem(getRequestParamsFromLastCandidate(document, this.lastCandidate))
            }

            // Unless the result is from the last candidate, we may want to apply the minimum
            // latency so that we don't show a result before the user has paused typing for a brief
            // moment.
            if (result.source !== InlineCompletionsResultSource.LastCandidate) {
                const latencyFeatureFlags: LatencyFeatureFlags = {
                    user: await minLatencyFlagsPromises.user,
                    language: await minLatencyFlagsPromises.language,
                    provider: await minLatencyFlagsPromises.provider,
                }
                // Do not apply the minimum latency if the last suggestion was not read, e.g when user was typing
                const isLastSuggestionRead = start - this.lastCompletionRequestTimestamp > READ_TIMEOUT_MS
                this.lastCompletionRequestTimestamp = start
                const isMinLatencyEnabled =
                    latencyFeatureFlags.user || latencyFeatureFlags.language || latencyFeatureFlags.provider
                if (isLastSuggestionRead && triggerKind === TriggerKind.Automatic && isMinLatencyEnabled) {
                    const minimumLatency = getLatency(
                        latencyFeatureFlags,
                        this.config.providerConfig.identifier,
                        document.uri.fsPath,
                        document.languageId,
                        result.items[0]?.nodeTypes?.atCursor
                    )

                    const delta = performance.now() - start
                    if (minimumLatency && delta < minimumLatency) {
                        await new Promise(resolve => setTimeout(resolve, minimumLatency - delta))
                    }

                    // Avoid any further work if the completion is invalidated during the the
                    // minimum duration pause
                    if (abortController.signal.aborted) {
                        return null
                    }
                }
            }

            const items = this.processInlineCompletionsForVSCode(
                result.logId,
                document,
                docContext,
                position,
                result.items,
                context
            )

            // A completion that won't be visible in VS Code will not be returned and not be logged.
            if (
                !isCompletionVisible(
                    items,
                    document,
                    position,
                    docContext,
                    context,
                    takeSuggestWidgetSelectionIntoAccount,
                    abortController.signal
                )
            ) {
                // Returning null will clear any existing suggestions, thus we need to reset the
                // last candidate.
                this.lastCandidate = undefined
                return null
            }

            // Since we now know that the completion is going to be visible in the UI, we save the
            // completion as the last candidate (that is shown as ghost text in the editor) so that
            // we can reuse it if the user types in such a way that it is still valid (such as by
            // typing `ab` if the ghost text suggests `abcd`).
            if (result.source !== InlineCompletionsResultSource.LastCandidate) {
                const candidate: LastInlineCompletionCandidate = {
                    uri: document.uri,
                    lastTriggerPosition: position,
                    lastTriggerDocContext: docContext,
                    lastTriggerSelectedInfoItem: context?.selectedCompletionInfo?.text,
                    result,
                }
                this.lastCandidate = items.length > 0 ? candidate : undefined
            }

            if (items.length > 0) {
                CompletionLogger.suggested(result.logId, InlineCompletionsResultSource[result.source], result.items[0])
            } else {
                CompletionLogger.noResponse(result.logId)
            }

            // return `CompletionEvent` telemetry data to the agent command `autocomplete/execute`.
            const completionResult: AutocompleteResult = {
                items,
                completionEvent: CompletionLogger.getCompletionEvent(result.logId),
            }

            return completionResult
        } catch (error) {
            this.onError(error as Error)
            throw error
        }
    }

    public handleDidAcceptCompletionItem(
        logId: SuggestionID,
        completion: InlineCompletionItemWithAnalytics,
        request: RequestParams
    ): void {
        resetLatency()
        // When a completion is accepted, the lastCandidate should be cleared. This makes sure the
        // log id is never reused if the completion is accepted.
        this.clearLastCandidate()

        // Remove the completion from the network cache
        this.requestManager.removeFromCache(request)

        this.handleFirstCompletionOnboardingNotice()

        CompletionLogger.accept(logId, completion)
    }

    /**
     * Handles showing a notification on the first completion acceptance.
     */
    private handleFirstCompletionOnboardingNotice(): void {
        if (!this.config.triggerNotice) {
            return // no trigger handler.
        }

        const key = 'completion.inline.hasAcceptedFirstCompletion'
        if (localStorage.get(key)) {
            return // Already seen notice.
        }

        // Mark as seen, so we don't show again after this.
        void localStorage.set(key, 'true')

        if (!this.isProbablyNewInstall) {
            // Only trigger for new installs for now, to avoid existing users from
            // seeing this. Consider removing this check in future, because existing
            // users would have had the key set above.
            return
        }

        this.config.triggerNotice({ key: 'onboarding-autocomplete' })
    }

    /**
     * Called when the user partially accepts a completion. This API is inspired by the the
     * be named the same, it's prefixed with `unstable_`
     */
    public unstable_handleDidPartiallyAcceptCompletionItem(
        logId: SuggestionID,
        completion: InlineCompletionItemWithAnalytics,
        acceptedLength: number
    ): void {
        CompletionLogger.partiallyAccept(logId, completion, acceptedLength)
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
     * Should only be used by agent to allow it access to clear the last candidate
     */
    public clearLastCandidate(): void {
        this.lastCandidate = undefined
    }

    /**
     * Process completions items in VS Code-specific ways.
     */
    private processInlineCompletionsForVSCode(
        logId: SuggestionID,
        document: vscode.TextDocument,
        docContext: DocumentContext,
        position: vscode.Position,
        items: InlineCompletionItemWithAnalytics[],
        context: vscode.InlineCompletionContext
    ): vscode.InlineCompletionItem[] {
        return items.map(completion => {
            const currentLine = document.lineAt(position)
            const currentLinePrefix = document.getText(currentLine.range.with({ end: position }))
            const insertText = completion.insertText

            // Return the completion from the start of the current line (instead of starting at the
            // given position). This avoids UI jitter in VS Code; when typing or deleting individual
            // characters, VS Code reuses the existing completion while it waits for the new one to
            // come in.
            const start = currentLine.range.start

            // The completion will always exclude the same line suffix, so it has to overwrite the
            // current same line suffix and reach to the end of the line.
            const end = currentLine.range.end

            return new vscode.InlineCompletionItem(currentLinePrefix + insertText, new vscode.Range(start, end), {
                title: 'Completion accepted',
                command: 'cody.autocomplete.inline.accepted',
                arguments: [
                    {
                        codyLogId: logId,
                        codyCompletion: completion,
                        codyRequest: {
                            document,
                            docContext,
                            selectedCompletionInfo: context.selectedCompletionInfo,
                            position,
                        } as RequestParams,
                    },
                ],
            })
        })
    }

    /**
     * A callback that is called whenever an error happens. We do not want to flood a users UI with
     * error messages so every unexpected error is deduplicated by its message and rate limit errors
     * are only shown once during the rate limit period.
     */
    private onError(error: Error | RateLimitError): void {
        if (error instanceof RateLimitError) {
            if (this.resetRateLimitErrorsAfter && this.resetRateLimitErrorsAfter > Date.now()) {
                return
            }
            this.resetRateLimitErrorsAfter = error.retryAfter?.getTime() ?? Date.now() + 24 * 60 * 60 * 1000
            this.config.statusBar.addError({
                title: 'Cody Autocomplete Disabled Due to Rate Limit',
                description:
                    `You've used all${error.limit ? ` ${error.limit}` : ''} daily autocompletions.` +
                    (error.retryAfter ? ` Usage will reset in ${formatDistance(error.retryAfter, new Date())}.` : ''),
                onSelect: () => {
                    void vscode.env.openExternal(
                        vscode.Uri.parse('https://docs.sourcegraph.com/cody/troubleshooting#autocomplete-rate-limits')
                    )
                },
            })
            return
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
}

let globalInvocationSequenceForTracer = 0

/**
 * Creates a tracer for a single invocation of
 * {@link InlineCompletionItemProvider.provideInlineCompletionItems} that accumulates all of the
 * data for that invocation.
 */
function createTracerForInvocation(tracer: ProvideInlineCompletionItemsTracer): InlineCompletionsParams['tracer'] {
    let data: ProvideInlineCompletionsItemTraceData = { invocationSequence: ++globalInvocationSequenceForTracer }
    return (update: Partial<ProvideInlineCompletionsItemTraceData>) => {
        data = { ...data, ...update }
        tracer(data)
    }
}

function isCompletionVisible(
    completions: vscode.InlineCompletionItem[],
    document: vscode.TextDocument,
    position: vscode.Position,
    docContext: DocumentContext,
    context: vscode.InlineCompletionContext,
    completeSuggestWidgetSelection: boolean,
    abortSignal: AbortSignal | undefined
): boolean {
    // There are these cases when a completion is being returned here but won't
    // be displayed by VS Code.
    //
    // - When the abort signal was already triggered and a new completion
    //   request was stared.
    //
    // - When the VS Code completion popup is open and we suggest a completion
    //   that does not match the currently selected completion. For now we make
    //   sure to not log these completions as displayed.
    //
    //   This check is only needed if we do not already take the completion
    //   popup into account when generating completions as we do with the
    //   completeSuggestWidgetSelection flag
    //
    // - When no completion contains all characters that are in the suffix of
    //   the current line. This happens because we extend the insert range of
    //   the completion to the whole line and any characters that are in the
    //   suffix that would be overwritten, will need to be part of the inserted
    //   completion (the VS Code UI does not allow character deletion). To test
    //   for this, we have to do a per-character diff.
    const isAborted = abortSignal ? abortSignal.aborted : false
    const isMatchingPopupItem = completeSuggestWidgetSelection
        ? true
        : completionMatchesPopupItem(completions, position, document, context)
    const isMatchingSuffix = completionMatchesSuffix(completions, docContext)
    const isVisible = !isAborted && isMatchingPopupItem && isMatchingSuffix

    return isVisible
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

// Checks if the currently selected completion widget item overlaps with the
// proposed completion.
//
// VS Code won't show a completion if it won't.
function completionMatchesPopupItem(
    completions: vscode.InlineCompletionItem[],
    position: vscode.Position,
    document: vscode.TextDocument,
    context: vscode.InlineCompletionContext
): boolean {
    if (context.selectedCompletionInfo) {
        const currentText = document.getText(context.selectedCompletionInfo.range)
        const selectedText = context.selectedCompletionInfo.text

        if (completions.length > 0) {
            const visibleCompletion = completions[0]
            const insertText = visibleCompletion.insertText
            if (typeof insertText !== 'string') {
                return true
            }

            // To ensure a good experience, the VS Code insertion might have the range start at the
            // beginning of the line. When this happens, the insertText needs to be adjusted to only
            // contain the insertion after the current position.
            const offset = position.character - (visibleCompletion.range?.start.character ?? position.character)
            const correctInsertText = insertText.slice(offset)
            if (!(currentText + correctInsertText).startsWith(selectedText)) {
                return false
            }
        }
    }
    return true
}

function completionMatchesSuffix(completions: vscode.InlineCompletionItem[], docContext: DocumentContext): boolean {
    const suffix = docContext.currentLineSuffix

    for (const completion of completions) {
        if (typeof completion.insertText !== 'string') {
            continue
        }
        const insertion = completion.insertText
        let j = 0
        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < insertion.length; i++) {
            if (insertion[i] === suffix[j]) {
                j++
            }
        }
        if (j === suffix.length) {
            return true
        }
    }

    return false
}

/**
 * Returns true if the only difference between the two requests is the selected completions info
 * item from the completions widget.
 */
function onlyCompletionWidgetSelectionChanged(prev: CompletionRequest, next: CompletionRequest): boolean {
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
