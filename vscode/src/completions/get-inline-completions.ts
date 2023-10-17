import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { isAbortError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'

import { logError } from '../log'

import { GetContextOptions, GetContextResult } from './context/context'
import { GraphContextFetcher } from './context/context-graph'
import { DocumentHistory } from './context/history'
import { DocumentContext } from './get-current-doc-context'
import * as CompletionLogger from './logger'
import { SuggestionID } from './logger'
import { CompletionProviderTracer, Provider, ProviderConfig, ProviderOptions } from './providers/provider'
import { RequestManager, RequestParams } from './request-manager'
import { reuseLastCandidate } from './reuse-last-candidate'
import { InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'
import { ProvideInlineCompletionsItemTraceData } from './tracer'
import { SNIPPET_WINDOW_SIZE } from './utils'

export interface InlineCompletionsParams {
    // Context
    document: vscode.TextDocument
    position: vscode.Position
    triggerKind: TriggerKind
    selectedCompletionInfo: vscode.SelectedCompletionInfo | undefined
    docContext: DocumentContext

    // Prompt parameters
    providerConfig: ProviderConfig
    graphContextFetcher?: GraphContextFetcher

    // Platform
    toWorkspaceRelativePath: (uri: URI) => string

    // Injected
    contextFetcher?: (options: GetContextOptions) => Promise<GetContextResult>
    getCodebaseContext?: () => CodebaseContext
    documentHistory?: DocumentHistory

    // Shared
    requestManager: RequestManager

    // UI state
    lastCandidate?: LastInlineCompletionCandidate
    debounceInterval?: { singleLine: number; multiLine: number }
    setIsLoading?: (isLoading: boolean) => void

    // Execution
    abortSignal?: AbortSignal
    tracer?: (data: Partial<ProvideInlineCompletionsItemTraceData>) => void

    // Feature flags
    completeSuggestWidgetSelection?: boolean
    useStreamingTruncation?: boolean

    // Callbacks to accept completions
    handleDidAcceptCompletionItem?: (
        logId: SuggestionID,
        completion: InlineCompletionItemWithAnalytics,
        request: RequestParams
    ) => void
    handleDidPartiallyAcceptCompletionItem?: (
        logId: SuggestionID,
        completion: InlineCompletionItemWithAnalytics,
        acceptedLength: number
    ) => void
}

/**
 * The last-suggested ghost text result, which can be reused if it is still valid.
 */
export interface LastInlineCompletionCandidate {
    /** The document URI for which this candidate was generated. */
    uri: URI

    /** The doc context item */
    lastTriggerDocContext: DocumentContext

    /** The position at which this candidate was generated. */
    lastTriggerPosition: vscode.Position

    /** The selected info item. */
    lastTriggerSelectedInfoItem: string | undefined

    /** The previously suggested result. */
    result: InlineCompletionsResult
}

/**
 * The result of a call to {@link getInlineCompletions}.
 */
export interface InlineCompletionsResult {
    /** The unique identifier for logging this result. */
    logId: SuggestionID

    /** Where this result was generated from. */
    source: InlineCompletionsResultSource

    /** The completions. */
    items: InlineCompletionItemWithAnalytics[]
}

/**
 * The source of the inline completions result.
 */
export enum InlineCompletionsResultSource {
    Network = 'Network',
    Cache = 'Cache',
    CacheAfterRequestStart = 'CacheAfterRequestStart',

    /**
     * The user is typing as suggested by the currently visible ghost text. For example, if the
     * user's editor shows ghost text `abc` ahead of the cursor, and the user types `ab`, the
     * original completion should be reused because it is still relevant.
     *
     * The last suggestion is passed in {@link InlineCompletionsParams.lastCandidate}.
     */
    LastCandidate = 'LastCandidate',
}

/**
 * Extends the default VS Code trigger kind to distinguish between manually invoking a completion
 * via the keyboard shortcut and invoking a completion via hovering over ghost text.
 */
export enum TriggerKind {
    /** Completion was triggered explicitly by a user hovering over ghost text. **/
    Hover = 'Hover',

    /** Completion was triggered automatically while editing. **/
    Automatic = 'Automatic',

    /** Completion was triggered manually by the user invoking the keyboard shortcut. **/
    Manual = 'Manual',

    /** When the user uses the suggest widget to cycle through different completions. */
    SuggestWidget = 'SuggestWidget',
}

export async function getInlineCompletions(params: InlineCompletionsParams): Promise<InlineCompletionsResult | null> {
    try {
        const result = await doGetInlineCompletions(params)
        params.tracer?.({ result })
        return result
    } catch (unknownError: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const error = unknownError instanceof Error ? unknownError : new Error(unknownError as any)

        params.tracer?.({ error: error.toString() })
        logError('getInlineCompletions:error', error.message, error.stack, { verbose: { error } })
        CompletionLogger.logError(error)

        if (isAbortError(error)) {
            return null
        }

        throw error
    } finally {
        params.setIsLoading?.(false)
    }
}

async function doGetInlineCompletions(params: InlineCompletionsParams): Promise<InlineCompletionsResult | null> {
    const {
        document,
        position,
        triggerKind,
        selectedCompletionInfo,
        docContext,
        docContext: { multilineTrigger, currentLineSuffix, currentLinePrefix },
        providerConfig,
        graphContextFetcher,
        toWorkspaceRelativePath,
        contextFetcher,
        getCodebaseContext,
        documentHistory,
        requestManager,
        lastCandidate,
        debounceInterval,
        setIsLoading,
        abortSignal,
        tracer,
        completeSuggestWidgetSelection = true,
        useStreamingTruncation = true,
        handleDidAcceptCompletionItem,
        handleDidPartiallyAcceptCompletionItem,
    } = params

    tracer?.({ params: { document, position, triggerKind, selectedCompletionInfo } })

    // If we have a suffix in the same line as the cursor and the suffix contains any word
    // characters, do not attempt to make a completion. This means we only make completions if
    // we have a suffix in the same line for special characters like `)]}` etc.
    //
    // VS Code will attempt to merge the remainder of the current line by characters but for
    // words this will easily get very confusing.
    if (triggerKind !== TriggerKind.Manual && /\w/.test(currentLineSuffix)) {
        return null
    }

    // Do not trigger when the last character is a closing symbol
    if (triggerKind !== TriggerKind.Manual && /[)\]}]$/.test(currentLinePrefix.trim())) {
        return null
    }

    // Do not trigger when cusor is at the start of the file ending line, and the line above is empty
    if (triggerKind !== TriggerKind.Manual && position.line !== 0 && position.line === document.lineCount - 1) {
        const lineAbove = Math.max(position.line - 1, 0)
        if (document.lineAt(lineAbove).isEmptyOrWhitespace && !position.character) {
            return null
        }
    }

    // Check if the user is typing as suggested by the last candidate completion (that is shown as
    // ghost text in the editor), and reuse it if it is still valid.
    const resultToReuse =
        triggerKind !== TriggerKind.Manual && lastCandidate
            ? reuseLastCandidate({
                  document,
                  position,
                  lastCandidate,
                  docContext,
                  selectedCompletionInfo,
                  completeSuggestWidgetSelection,
                  handleDidAcceptCompletionItem,
                  handleDidPartiallyAcceptCompletionItem,
              })
            : null
    if (resultToReuse) {
        return resultToReuse
    }

    // Only log a completion as started if it's either served from cache _or_ the debounce interval
    // has passed to ensure we don't log too many start events where we end up not doing any work at
    // all.
    CompletionLogger.flushActiveSuggestions()
    const multiline = Boolean(multilineTrigger)
    const logId = CompletionLogger.create({
        multiline,
        triggerKind,
        providerIdentifier: providerConfig.identifier,
        providerModel: providerConfig.model,
        languageId: document.languageId,
    })

    // Debounce to avoid firing off too many network requests as the user is still typing.
    const interval = multiline ? debounceInterval?.multiLine : debounceInterval?.singleLine
    if (triggerKind === TriggerKind.Automatic && interval !== undefined && interval > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, interval))
    }

    // We don't need to make a request at all if the signal is already aborted after the debounce.
    if (abortSignal?.aborted) {
        return null
    }

    setIsLoading?.(true)
    CompletionLogger.start(logId)

    // Fetch context
    const contextResult = await getCompletionContext({
        document,
        position,
        providerConfig,
        graphContextFetcher,
        contextFetcher,
        getCodebaseContext,
        documentHistory,
        docContext,
    })
    if (abortSignal?.aborted) {
        return null
    }
    tracer?.({ context: contextResult })

    // Completion providers
    const completionProviders = getCompletionProviders({
        document,
        position,
        triggerKind,
        providerConfig,
        docContext,
        toWorkspaceRelativePath,
        useStreamingTruncation,
    })
    tracer?.({ completers: completionProviders.map(({ options }) => options) })

    CompletionLogger.networkRequestStarted(logId, contextResult?.logSummary)

    const reqContext: RequestParams = {
        document,
        docContext,
        position,
        selectedCompletionInfo,
    }

    // Get the processed completions from providers
    const { completions, cacheHit } = await requestManager.request(
        reqContext,
        completionProviders,
        contextResult?.context ?? [],

        tracer ? createCompletionProviderTracer(tracer) : undefined
    )

    const source =
        cacheHit === 'hit'
            ? InlineCompletionsResultSource.Cache
            : cacheHit === 'hit-after-request-started'
            ? InlineCompletionsResultSource.CacheAfterRequestStart
            : InlineCompletionsResultSource.Network

    CompletionLogger.loaded(logId, reqContext, completions)

    return {
        logId,
        items: completions,
        source,
    }
}

interface GetCompletionProvidersParams
    extends Pick<
        InlineCompletionsParams,
        'document' | 'position' | 'triggerKind' | 'providerConfig' | 'toWorkspaceRelativePath'
    > {
    docContext: DocumentContext
    useStreamingTruncation?: boolean
}

function getCompletionProviders(params: GetCompletionProvidersParams): Provider[] {
    const {
        document,
        position,
        triggerKind,
        providerConfig,
        docContext,
        toWorkspaceRelativePath,
        useStreamingTruncation,
    } = params

    const sharedProviderOptions: Omit<ProviderOptions, 'id' | 'n' | 'multiline'> = {
        docContext,
        document,
        position,
        fileName: toWorkspaceRelativePath(document.uri),
        useStreamingTruncation: Boolean(useStreamingTruncation),
    }

    if (docContext.multilineTrigger) {
        return [
            providerConfig.create({
                id: 'multiline',
                ...sharedProviderOptions,
                n: 3, // 3 vs. 1 does not meaningfully affect perf
                multiline: true,
            }),
        ]
    }
    return [
        providerConfig.create({
            id: 'single-line-suffix',
            ...sharedProviderOptions,
            // Show more if manually triggered (but only showing 1 is faster, so we use it
            // in the automatic trigger case).
            n: triggerKind === TriggerKind.Automatic ? 1 : 3,
            multiline: false,
        }),
    ]
}

interface GetCompletionContextParams
    extends Pick<
        InlineCompletionsParams,
        | 'document'
        | 'position'
        | 'providerConfig'
        | 'graphContextFetcher'
        | 'contextFetcher'
        | 'getCodebaseContext'
        | 'documentHistory'
    > {
    docContext: DocumentContext
}

async function getCompletionContext({
    document,
    position,
    providerConfig,
    graphContextFetcher,
    contextFetcher,
    getCodebaseContext,
    documentHistory,
    docContext: { prefix, suffix, contextRange },
}: GetCompletionContextParams): Promise<GetContextResult | null> {
    if (!contextFetcher) {
        return null
    }
    if (!getCodebaseContext) {
        throw new Error('getCodebaseContext is required if contextFetcher is provided')
    }
    if (!documentHistory) {
        throw new Error('documentHistory is required if contextFetcher is provided')
    }

    return contextFetcher({
        document,
        position,
        prefix,
        suffix,
        contextRange,
        history: documentHistory,
        jaccardDistanceWindowSize: SNIPPET_WINDOW_SIZE,
        maxChars: providerConfig.contextSizeHints.totalFileContextChars,
        getCodebaseContext,
        graphContextFetcher,
    })
}

function createCompletionProviderTracer(
    tracer: InlineCompletionsParams['tracer']
): CompletionProviderTracer | undefined {
    return (
        tracer && {
            params: data => tracer({ completionProviderCallParams: data }),
            result: data => tracer({ completionProviderCallResult: data }),
        }
    )
}
