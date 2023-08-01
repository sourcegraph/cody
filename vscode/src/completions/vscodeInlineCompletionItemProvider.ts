import path from 'path'

import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'

import { debug } from '../log'
import { CodyStatusBar } from '../services/StatusBar'

import { CachedCompletions, CompletionsCache } from './cache'
import { getContext, GetContextOptions, GetContextResult } from './context'
import { getCurrentDocContext } from './document'
import { DocumentHistory } from './history'
import * as CompletionLogger from './logger'
import { detectMultiline } from './multiline'
import { CompletionProviderTracer, Provider, ProviderConfig, ProviderOptions } from './providers/provider'
import { RequestManager } from './request-manager'
import { sharedPostProcess } from './shared-post-process'
import { ProvideInlineCompletionItemsTracer, ProvideInlineCompletionsItemTraceData } from './tracer'
import { isAbortError, SNIPPET_WINDOW_SIZE } from './utils'

interface CodyCompletionItemProviderConfig {
    providerConfig: ProviderConfig
    history: DocumentHistory
    statusBar: CodyStatusBar
    codebaseContext: CodebaseContext
    responsePercentage?: number
    prefixPercentage?: number
    suffixPercentage?: number
    disableTimeouts?: boolean
    isEmbeddingsContextEnabled?: boolean
    cache: CompletionsCache | null
    completeSuggestWidgetSelection?: boolean
    tracer?: ProvideInlineCompletionItemsTracer | null
    contextFetcher?: (options: GetContextOptions) => Promise<GetContextResult>
}

export class InlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {
    private promptChars: number
    private maxPrefixChars: number
    private maxSuffixChars: number
    private abortOpenCompletions: () => void = () => {}
    private stopLoading: () => void = () => {}
    private lastContentChanges: LRUCache<string, 'add' | 'del'> = new LRUCache<string, 'add' | 'del'>({
        max: 10,
    })

    private readonly config: Required<CodyCompletionItemProviderConfig>

    private requestManager: RequestManager
    private previousCompletionLogId?: string

    constructor({
        responsePercentage = 0.1,
        prefixPercentage = 0.6,
        suffixPercentage = 0.1,
        disableTimeouts = false,
        isEmbeddingsContextEnabled = true,
        completeSuggestWidgetSelection = false,
        tracer = null,
        ...config
    }: CodyCompletionItemProviderConfig) {
        this.config = {
            ...config,
            responsePercentage,
            prefixPercentage,
            suffixPercentage,
            disableTimeouts,
            isEmbeddingsContextEnabled,
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

        this.requestManager = new RequestManager(this.config.cache)

        debug('CodyCompletionProvider:initialized', `provider: ${this.config.providerConfig.identifier}`)

        vscode.workspace.onDidChangeTextDocument(event => {
            const document = event.document
            const changes = event.contentChanges

            if (changes.length <= 0) {
                return
            }

            const text = changes[0].text
            this.lastContentChanges.set(document.fileName, text.length > 0 ? 'add' : 'del')
        })
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
    ): Promise<vscode.InlineCompletionList> {
        const tracer = this.config.tracer ? createTracerForInvocation(this.config.tracer) : null

        try {
            const result = await this.provideInlineCompletionItemsInner(document, position, context, token, tracer)
            tracer?.({ result })
            return result
        } catch (unknownError: unknown) {
            const error = unknownError instanceof Error ? unknownError : new Error(unknownError as any)
            tracer?.({ error: error.toString() })
            this.stopLoading()

            if (!isAbortError(error)) {
                console.error(error)
                debug('CodyCompletionProvider:inline:error', `${error.toString()}\n${error.stack}`)
            }

            throw error
        }
    }

    private async provideInlineCompletionItemsInner(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken | undefined,
        tracer: SingleInvocationTracer | null
    ): Promise<vscode.InlineCompletionList> {
        tracer?.({ params: { document, position, context } })

        const abortController = new AbortController()
        this.abortOpenCompletions()
        if (token) {
            token.onCancellationRequested(() => abortController.abort())
            this.abortOpenCompletions = () => abortController.abort()
        }

        const docContext = getCurrentDocContext(document, position, this.maxPrefixChars, this.maxSuffixChars)
        if (!docContext) {
            return emptyCompletions()
        }

        const multiline = detectMultiline(
            docContext,
            document.languageId,
            this.config.providerConfig.enableExtendedMultilineTriggers
        )

        let triggeredForSuggestWidgetSelection: string | undefined
        if (context.selectedCompletionInfo) {
            if (this.config.completeSuggestWidgetSelection) {
                triggeredForSuggestWidgetSelection = context.selectedCompletionInfo.text
            } else {
                // Don't show completions if the suggest widget (which shows language autocomplete)
                // is showing.
                return emptyCompletions()
            }
        }

        // If we have a suffix in the same line as the cursor and the suffix contains any word
        // characters, do not attempt to make a completion. This means we only make completions if
        // we have a suffix in the same line for special characters like `)]}` etc.
        //
        // VS Code will attempt to merge the remainder of the current line by characters but for
        // words this will easily get very confusing.
        if (/\w/.test(docContext.currentLineSuffix)) {
            return emptyCompletions()
        }

        let cachedCompletions: CachedCompletions | undefined

        // Avoid showing completions when we're deleting code (Cody can only insert code at the
        // moment)
        const lastChange = this.lastContentChanges.get(document.fileName) ?? 'add'
        if (lastChange === 'del') {
            // When a line was deleted, only look up cached items and only include them if the
            // untruncated prefix matches. This fixes some weird issues where the completion would
            // render if you insert whitespace but not on the original place when you delete it
            // again
            cachedCompletions = this.config.cache?.get(docContext.prefix, false)
            if (!cachedCompletions?.isExactPrefix) {
                return emptyCompletions()
            }
        }

        // If cachedCompletions was already set by the above logic, we don't have to query the cache
        // again.
        cachedCompletions = cachedCompletions ?? this.config.cache?.get(docContext.prefix)

        // We create a log entry after determining if we have a potential cache hit. This is
        // necessary to make sure that typing text of a displayed completion will not log a new
        // completion on every keystroke
        //
        // However we only log a completion as started if it's either served from cache _or_ the
        // debounce interval has passed to ensure we don't log too many start events where we end up
        // not doing any work at all
        const useLogIdFromPreviousCompletion =
            cachedCompletions?.logId && cachedCompletions?.logId === this.previousCompletionLogId
        if (!useLogIdFromPreviousCompletion) {
            CompletionLogger.clear()
        }
        const logId = useLogIdFromPreviousCompletion
            ? cachedCompletions!.logId
            : CompletionLogger.create({
                  multiline,
                  providerIdentifier: this.config.providerConfig.identifier,
                  languageId: document.languageId,
                  triggeredForSuggestWidgetSelection: triggeredForSuggestWidgetSelection !== undefined,
                  settings: {
                      autocompleteExperimentalCompleteSuggestWidgetSelection: Boolean(
                          this.config.completeSuggestWidgetSelection
                      ),
                  },
              })
        this.previousCompletionLogId = logId

        if (cachedCompletions) {
            // When we serve a completion from the cache and create a new log
            // id, we want to ensure to only refer to the new id for future
            // cache retrievals. If we don't do this, every subsequent cache hit
            // would otherwise no longer match the previous completion ID and we
            // would log a new completion each time, even if the user just
            // continues typing on the currently displayed completion.
            if (logId !== cachedCompletions.logId) {
                this.config.cache?.updateLogId(cachedCompletions.logId, logId)
            }

            tracer?.({ cacheHit: true })
            CompletionLogger.start(logId)
            return this.prepareCompletions(
                logId,
                cachedCompletions.completions,
                document,
                context,
                position,
                docContext.prefix,
                docContext.suffix,
                multiline,
                document.languageId,
                true,
                abortController.signal
            )
        }
        tracer?.({ cacheHit: false })

        const completers: Provider[] = []
        let timeout: number

        const sharedProviderOptions: Omit<ProviderOptions, 'id' | 'n' | 'multiline'> = {
            prefix: docContext.prefix,
            suffix: docContext.suffix,
            fileName: path.normalize(vscode.workspace.asRelativePath(document.fileName ?? '')),
            languageId: document.languageId,
            responsePercentage: this.config.responsePercentage,
            prefixPercentage: this.config.prefixPercentage,
            suffixPercentage: this.config.suffixPercentage,
        }

        if (multiline) {
            timeout = 100
            completers.push(
                this.config.providerConfig.create({
                    id: 'multiline',
                    ...sharedProviderOptions,
                    n: 3, // 3 vs. 1 does not meaningfully affect perf
                    multiline: true,
                })
            )
        } else {
            timeout = 20
            completers.push(
                this.config.providerConfig.create({
                    id: 'single-line-suffix',
                    ...sharedProviderOptions,
                    // Show more if manually triggered (but only showing 1 is faster, so we use it
                    // in the automatic trigger case).
                    n: context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic ? 1 : 3,
                    multiline: false,
                })
            )
        }
        tracer?.({ completers: completers.map(({ options }) => options) })

        if (!this.config.disableTimeouts && context.triggerKind !== vscode.InlineCompletionTriggerKind.Invoke) {
            await delay(timeout)
        }

        // We don't need to make a request at all if the signal is already aborted after the
        // debounce
        if (abortController.signal.aborted) {
            return emptyCompletions()
        }

        CompletionLogger.start(logId)

        const stopLoading = this.config.statusBar.startLoading('Completions are being generated')
        this.stopLoading = stopLoading
        // Overwrite the abort handler to also update the loading state
        const previousAbort = this.abortOpenCompletions
        this.abortOpenCompletions = () => {
            previousAbort()
            stopLoading()
        }

        const contextResult = await this.config.contextFetcher({
            document,
            prefix: docContext.prefix,
            suffix: docContext.suffix,
            history: this.config.history,
            jaccardDistanceWindowSize: SNIPPET_WINDOW_SIZE,
            maxChars: this.promptChars,
            codebaseContext: this.config.codebaseContext,
            isEmbeddingsContextEnabled: this.config.isEmbeddingsContextEnabled,
        })
        if (abortController.signal.aborted) {
            return emptyCompletions()
        }
        tracer?.({ context: contextResult })

        CompletionLogger.networkRequestStarted(logId, contextResult.logSummary)

        const completions = await this.requestManager.request(
            document.uri.toString(),
            logId,
            docContext.prefix,
            completers,
            contextResult.context,
            abortController.signal,
            tracer ? createCompletionProviderTracer(tracer) : undefined
        )

        stopLoading()
        return this.prepareCompletions(
            logId,
            completions,
            document,
            context,
            position,
            docContext.prefix,
            docContext.suffix,
            multiline,
            document.languageId,
            false,
            abortController.signal
        )
    }

    private async prepareCompletions(
        logId: string,
        completions: Completion[],
        document: vscode.TextDocument,
        context: vscode.InlineCompletionContext,
        position: vscode.Position,
        prefix: string,
        suffix: string,
        multiline: boolean,
        languageId: string,
        isCacheHit: boolean,
        abortSignal: AbortSignal
    ): Promise<vscode.InlineCompletionList> {
        const results = processCompletions(completions, prefix, suffix, multiline, languageId)

        // We usually resolve cached results instantly. However, if the inserted completion would
        // include more than one line, this can create a lot of visible UI churn. To avoid this, we
        // debounce these results and wait for the user to stop typing for a bit before applying
        // them.
        //
        // The duration we wait is longer than the debounce time for new requests because we do not
        // have network latency for cache completion
        const visibleResult = results[0]
        if (
            isCacheHit &&
            visibleResult?.content.includes('\n') &&
            !this.config.disableTimeouts &&
            context.triggerKind !== vscode.InlineCompletionTriggerKind.Invoke
        ) {
            await delay(400)
            if (abortSignal.aborted) {
                return { items: [] }
            }
        }

        if (results.length > 0) {
            // When the VS Code completion popup is open and we suggest a completion that does not match
            // the currently selected completion, VS Code won't display it. For now we make sure to not
            // log these completions as displayed.
            //
            // TODO: Take this into account when creating the completion prefix.
            let isCompletionVisible = true
            if (context.selectedCompletionInfo) {
                const currentText = document.getText(context.selectedCompletionInfo.range)
                const selectedText = context.selectedCompletionInfo.text
                if (!(currentText + results[0].content).startsWith(selectedText)) {
                    isCompletionVisible = false
                }
            }

            if (isCompletionVisible) {
                CompletionLogger.suggest(logId, isCompletionVisible)
            }

            return toInlineCompletionItems(logId, document, position, results)
        }

        CompletionLogger.noResponse(logId)
        return emptyCompletions()
    }
}

export interface Completion {
    prefix: string
    content: string
    stopReason?: string
}

function processCompletions(
    completions: Completion[],
    prefix: string,
    suffix: string,
    multiline: boolean,
    languageId: string
): Completion[] {
    // Shared post-processing logic
    const processedCompletions = completions.map(completion =>
        sharedPostProcess({ prefix, suffix, multiline, languageId, completion })
    )

    // Filter results
    const visibleResults = filterCompletions(processedCompletions)

    // Remove duplicate results
    const uniqueResults = [...new Map(visibleResults.map(c => [c.content, c])).values()]

    // Rank results
    const rankedResults = rankCompletions(uniqueResults)

    return rankedResults
}

function toInlineCompletionItems(
    logId: string,
    document: vscode.TextDocument,
    position: vscode.Position,
    completions: Completion[]
): vscode.InlineCompletionList {
    return {
        items: completions.map(completion => {
            const lines = completion.content.split(/\r\n|\r|\n/).length
            const currentLineText = document.lineAt(position)
            const endOfLine = currentLineText.range.end
            return new vscode.InlineCompletionItem(completion.content, new vscode.Range(position, endOfLine), {
                title: 'Completion accepted',
                command: 'cody.autocomplete.inline.accepted',
                arguments: [{ codyLogId: logId, codyLines: lines }],
            })
        }),
    }
}

function rankCompletions(completions: Completion[]): Completion[] {
    // TODO(philipp-spiess): Improve ranking to something more complex then just length
    return completions.sort((a, b) => b.content.split('\n').length - a.content.split('\n').length)
}

function filterCompletions(completions: Completion[]): Completion[] {
    return completions.filter(c => c.content.trim() !== '')
}

let globalInvocationSequenceForTracer = 0

type SingleInvocationTracer = (data: Partial<ProvideInlineCompletionsItemTraceData>) => void

/**
 * Creates a tracer for a single invocation of
 * {@link CodyCompletionItemProvider.provideInlineCompletionItems} that accumulates all of the data
 * for that invocation.
 */
function createTracerForInvocation(tracer: ProvideInlineCompletionItemsTracer): SingleInvocationTracer {
    let data: ProvideInlineCompletionsItemTraceData = { invocationSequence: ++globalInvocationSequenceForTracer }
    return (update: Partial<ProvideInlineCompletionsItemTraceData>) => {
        data = { ...data, ...update }
        tracer(data)
    }
}

function emptyCompletions(): vscode.InlineCompletionList {
    CompletionLogger.clear()
    return { items: [] }
}

function createCompletionProviderTracer(tracer: SingleInvocationTracer): CompletionProviderTracer {
    return {
        params: data => tracer({ completionProviderCallParams: data }),
        result: data => tracer({ completionProviderCallResult: data }),
    }
}

function delay(milliseconds: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, milliseconds))
}
