import { formatDistance } from 'date-fns'
import * as vscode from 'vscode'

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { FeatureFlag, FeatureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { RateLimitError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'

import { logDebug } from '../log'
import { CodyStatusBar } from '../services/StatusBar'

import { getContext, GetContextOptions, GetContextResult, GraphContextFetcher } from './context/context'
import { DocumentHistory } from './context/history'
import { DocumentContext, getCurrentDocContext } from './get-current-doc-context'
import {
    getInlineCompletions,
    InlineCompletionsParams,
    InlineCompletionsResultSource,
    LastInlineCompletionCandidate,
} from './getInlineCompletions'
import * as CompletionLogger from './logger'
import { ProviderConfig } from './providers/provider'
import { RequestManager } from './request-manager'
import { getNextNonEmptyLine } from './text-processing'
import { ProvideInlineCompletionItemsTracer, ProvideInlineCompletionsItemTraceData } from './tracer'
import { InlineCompletionItem } from './types'

export interface CodyCompletionItemProviderConfig {
    providerConfig: ProviderConfig
    history: DocumentHistory
    statusBar: CodyStatusBar
    getCodebaseContext: () => CodebaseContext
    responsePercentage?: number
    prefixPercentage?: number
    suffixPercentage?: number
    isEmbeddingsContextEnabled?: boolean
    graphContextFetcher?: GraphContextFetcher | null
    completeSuggestWidgetSelection?: boolean
    tracer?: ProvideInlineCompletionItemsTracer | null
    contextFetcher?: (options: GetContextOptions) => Promise<GetContextResult>
    featureFlagProvider: FeatureFlagProvider
}

export class InlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {
    private promptChars: number
    private maxPrefixChars: number
    private maxSuffixChars: number
    // private reportedErrorMessages: Map<string, number> = new Map()
    private resetRateLimitErrorsAfter: number | null = null

    private readonly config: Required<CodyCompletionItemProviderConfig>

    private requestManager: RequestManager

    /** Mockable (for testing only). */
    protected getInlineCompletions = getInlineCompletions

    /** Accessible for testing only. */
    protected lastCandidate: LastInlineCompletionCandidate | undefined

    constructor({
        responsePercentage = 0.1,
        prefixPercentage = 0.6,
        suffixPercentage = 0.1,
        isEmbeddingsContextEnabled = true,
        graphContextFetcher = null,
        completeSuggestWidgetSelection = false,
        tracer = null,
        ...config
    }: CodyCompletionItemProviderConfig) {
        this.config = {
            ...config,
            responsePercentage,
            prefixPercentage,
            suffixPercentage,
            isEmbeddingsContextEnabled,
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

        this.promptChars =
            this.config.providerConfig.maximumContextCharacters -
            this.config.providerConfig.maximumContextCharacters * responsePercentage
        this.maxPrefixChars = Math.floor(this.promptChars * this.config.prefixPercentage)
        this.maxSuffixChars = Math.floor(this.promptChars * this.config.suffixPercentage)

        this.requestManager = new RequestManager({
            completeSuggestWidgetSelection: this.config.completeSuggestWidgetSelection,
        })

        logDebug(
            'CodyCompletionProvider:initialized',
            `${this.config.providerConfig.identifier}/${this.config.providerConfig.model}`
        )
    }

    /** Set the tracer (or unset it with `null`). */
    public setTracer(value: ProvideInlineCompletionItemsTracer | null): void {
        this.config.tracer = value
    }

    public async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        // Making it optional here to execute multiple suggestion in parallel from the CLI script.
        token?: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList | null> {
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

        const docContext = getCurrentDocContext(
            document,
            position,
            this.maxPrefixChars,
            this.maxSuffixChars,
            // We ignore the current context selection if completeSuggestWidgetSelection is not
            // enabled
            this.config.completeSuggestWidgetSelection ? context : undefined
        )

        const isIncreasedDebounceTimeEnabled = await this.config.featureFlagProvider.evaluateFeatureFlag(
            FeatureFlag.CodyAutocompleteIncreasedDebounceTimeEnabled
        )
        try {
            const result = await this.getInlineCompletions({
                document,
                position,
                context,
                docContext,
                promptChars: this.promptChars,
                providerConfig: this.config.providerConfig,
                responsePercentage: this.config.responsePercentage,
                prefixPercentage: this.config.prefixPercentage,
                suffixPercentage: this.config.suffixPercentage,
                isEmbeddingsContextEnabled: this.config.isEmbeddingsContextEnabled,
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
            })

            if (!result) {
                return null
            }

            // Track the last candidate completion (that is shown as ghost text in the editor) so that
            // we can reuse it if the user types in such a way that it is still valid (such as by typing
            // `ab` if the ghost text suggests `abcd`).
            if (result.source !== InlineCompletionsResultSource.LastCandidate) {
                this.lastCandidate =
                    result.items.length > 0
                        ? {
                              uri: document.uri,
                              lastTriggerPosition: position,
                              lastTriggerCurrentLinePrefix: document.lineAt(position).text.slice(0, position.character),
                              lastTriggerNextNonEmptyLine: getNextNonEmptyLine(
                                  document.getText(
                                      new vscode.Range(position, document.lineAt(document.lineCount - 1).range.end)
                                  )
                              ),
                              lastTriggerSelectedInfoItem: context?.selectedCompletionInfo?.text,
                              result: {
                                  logId: result.logId,
                                  items: result.items,
                              },
                          }
                        : undefined
            }

            const items = this.processInlineCompletionsForVSCode(
                result.logId,
                document,
                position,
                result.items,
                context
            )

            // A completion that won't be visible in VS Code will not be returned and not be logged.
            if (
                !isCompletionVisible(
                    items,
                    document,
                    docContext,
                    context,
                    this.config.completeSuggestWidgetSelection,
                    abortController.signal
                )
            ) {
                return null
            }

            const event = CompletionLogger.completionEvent(result.logId)
            if (items.length > 0) {
                CompletionLogger.suggested(result.logId, InlineCompletionsResultSource[result.source], items[0] as any)
            } else {
                CompletionLogger.noResponse(result.logId)
            }

            const completionResult: vscode.InlineCompletionList = { items }

            ;(completionResult as any).completionEvent = event

            return completionResult
        } catch (error) {
            this.onError(error as Error)
            throw error
        }
    }

    public handleDidAcceptCompletionItem(logId: string, completion: InlineCompletionItem): void {
        // When a completion is accepted, the lastCandidate should be cleared. This makes sure the
        // log id is never reused if the completion is accepted.
        this.lastCandidate = undefined

        CompletionLogger.accept(logId, completion)
    }

    /**
     * Process completions items in VS Code-specific ways.
     */
    private processInlineCompletionsForVSCode(
        logId: string,
        document: vscode.TextDocument,
        position: vscode.Position,
        items: InlineCompletionItem[],
        context: vscode.InlineCompletionContext
    ): vscode.InlineCompletionItem[] {
        return items.map(completion => {
            const currentLine = document.lineAt(position)
            const currentLinePrefix = document.getText(currentLine.range.with({ end: position }))
            let insertText = completion.insertText

            // Append any eventual inline completion context item to the prefix if
            // completeSuggestWidgetSelection is enabled.
            if (this.config.completeSuggestWidgetSelection && context.selectedCompletionInfo) {
                const { range, text } = context.selectedCompletionInfo
                insertText = text.slice(position.character - range.start.character) + insertText
            }

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
        //     this.reportedErrorMessages.has(error.message) &&
        //     this.reportedErrorMessages.get(error.message)! + ONE_HOUR >= now
        // ) {
        //     return
        // }
        // this.reportedErrorMessages.set(error.message, now)
        // this.config.statusBar.addError({
        //     title: 'Cody Autocomplete Encountered an Unexpected Error',
        //     description: error.message,
        //     onSelect: () => {
        //         outputChannel.show()
        //     },
        // })
    }
}

let globalInvocationSequenceForTracer = 0

/**
 * Creates a tracer for a single invocation of
 * {@link CodyCompletionItemProvider.provideInlineCompletionItems} that accumulates all of the data
 * for that invocation.
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
    // - When no completions contains characters in the current line that are
    //   not in the current line suffix. Since VS Code will try to merge
    //   completion with the suffix, we have to do a per-character diff to test
    //   this.
    const isAborted = abortSignal ? abortSignal.aborted : false
    const isMatchingPopupItem = completeSuggestWidgetSelection
        ? true
        : completionMatchesPopupItem(completions, document, context)
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
    document: vscode.TextDocument,
    context: vscode.InlineCompletionContext
): boolean {
    if (context.selectedCompletionInfo) {
        const currentText = document.getText(context.selectedCompletionInfo.range)
        const selectedText = context.selectedCompletionInfo.text
        if (completions.length > 0) {
            const visibleCompletion = completions[0]
            if (
                typeof visibleCompletion.insertText === 'string' &&
                !(currentText + visibleCompletion.insertText).startsWith(selectedText)
            ) {
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
