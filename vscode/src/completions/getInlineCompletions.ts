import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { isAbortError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'

import { logError } from '../log'

import { GetContextOptions, GetContextResult } from './context/context'
import { DocumentHistory } from './context/history'
import { DocumentContext } from './get-current-doc-context'
import * as CompletionLogger from './logger'
import { CompletionProviderTracer, Provider, ProviderConfig, ProviderOptions } from './providers/provider'
import { RequestManager, RequestParams } from './request-manager'
import { reuseLastCandidate } from './reuse-last-candidate'
import { ProvideInlineCompletionsItemTraceData } from './tracer'
import { InlineCompletionItem } from './types'
import { SNIPPET_WINDOW_SIZE } from './utils'

export interface InlineCompletionsParams {
    // Context
    document: vscode.TextDocument
    position: vscode.Position
    context: vscode.InlineCompletionContext
    docContext: DocumentContext

    // Prompt parameters
    promptChars: number
    providerConfig: ProviderConfig
    responsePercentage: number
    prefixPercentage: number
    suffixPercentage: number
    isEmbeddingsContextEnabled: boolean

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
}

/**
 * The last-suggested ghost text result, which can be reused if it is still valid.
 */
export interface LastInlineCompletionCandidate {
    /** The document URI for which this candidate was generated. */
    uri: URI

    /** The position at which this candidate was generated. */
    lastTriggerPosition: vscode.Position

    /** The prefix of the line (before the cursor position) where this candidate was generated. */
    lastTriggerCurrentLinePrefix: string

    /** The next non-empty line in the suffix */
    lastTriggerNextNonEmptyLine: string

    /** The selected info item. */
    lastTriggerSelectedInfoItem: string | undefined

    /** The previously suggested result. */
    result: Pick<InlineCompletionsResult, 'logId' | 'items'>
}

/**
 * The result of a call to {@link getInlineCompletions}.
 */
export interface InlineCompletionsResult {
    /** The unique identifier for logging this result. */
    logId: string

    /** Where this result was generated from. */
    source: InlineCompletionsResultSource

    /** The completions. */
    items: InlineCompletionItem[]
}

/**
 * The source of the inline completions result.
 */
export enum InlineCompletionsResultSource {
    Network,
    Cache,
    CacheAfterRequestStart,

    /**
     * The user is typing as suggested by the currently visible ghost text. For example, if the
     * user's editor shows ghost text `abc` ahead of the cursor, and the user types `ab`, the
     * original completion should be reused because it is still relevant.
     *
     * The last suggestion is passed in {@link InlineCompletionsParams.lastCandidate}.
     */
    LastCandidate,
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
        logError('getInlineCompletions:error', error.message, error.stack, { verbose: { params, error } })
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
        context,
        docContext,
        docContext: { multiline, currentLineSuffix },
        promptChars,
        providerConfig,
        responsePercentage,
        prefixPercentage,
        suffixPercentage,
        isEmbeddingsContextEnabled,
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
        completeSuggestWidgetSelection = false,
    } = params

    tracer?.({ params: { document, position, context } })

    // If we have a suffix in the same line as the cursor and the suffix contains any word
    // characters, do not attempt to make a completion. This means we only make completions if
    // we have a suffix in the same line for special characters like `)]}` etc.
    //
    // VS Code will attempt to merge the remainder of the current line by characters but for
    // words this will easily get very confusing.
    if (/\w/.test(currentLineSuffix)) {
        return null
    }

    // Check if the user is typing as suggested by the last candidate completion (that is shown as
    // ghost text in the editor), and reuse it if it is still valid.
    const resultToReuse = lastCandidate
        ? reuseLastCandidate({
              document,
              position,
              lastCandidate,
              docContext,
              context,
              completeSuggestWidgetSelection,
          })
        : null
    if (resultToReuse) {
        return resultToReuse
    }

    // Only log a completion as started if it's either served from cache _or_ the debounce interval
    // has passed to ensure we don't log too many start events where we end up not doing any work at
    // all.
    CompletionLogger.clear()
    const logId = CompletionLogger.create({
        multiline,
        providerIdentifier: providerConfig.identifier,
        providerModel: providerConfig.model,
        languageId: document.languageId,
    })

    // Debounce to avoid firing off too many network requests as the user is still typing.
    const interval = multiline ? debounceInterval?.multiLine : debounceInterval?.singleLine
    if (interval !== undefined && interval > 0) {
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
        promptChars,
        isEmbeddingsContextEnabled,
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
        context,
        providerConfig,
        responsePercentage,
        prefixPercentage,
        suffixPercentage,
        docContext,
        toWorkspaceRelativePath,
    })
    tracer?.({ completers: completionProviders.map(({ options }) => options) })

    CompletionLogger.networkRequestStarted(logId, contextResult?.logSummary)

    const reqContext: RequestParams = {
        document,
        docContext,
        position,
        multiline, // TODO: drop in favor of docContext.
        context,
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

    CompletionLogger.loaded(logId)

    return {
        logId,
        items: completions,
        source,
    }
}

interface GetCompletionProvidersParams
    extends Pick<
        InlineCompletionsParams,
        | 'document'
        | 'context'
        | 'providerConfig'
        | 'responsePercentage'
        | 'prefixPercentage'
        | 'suffixPercentage'
        | 'toWorkspaceRelativePath'
    > {
    docContext: DocumentContext
}

function getCompletionProviders(params: GetCompletionProvidersParams): Provider[] {
    const {
        document,
        context,
        providerConfig,
        responsePercentage,
        prefixPercentage,
        suffixPercentage,
        docContext,
        toWorkspaceRelativePath,
    } = params
    const sharedProviderOptions: Omit<ProviderOptions, 'id' | 'n' | 'multiline'> = {
        docContext,
        fileName: toWorkspaceRelativePath(document.uri),
        languageId: document.languageId,
        responsePercentage,
        prefixPercentage,
        suffixPercentage,
    }
    if (docContext.multiline) {
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
            n: context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic ? 1 : 3,
            multiline: false,
        }),
    ]
}

interface GetCompletionContextParams
    extends Pick<
        InlineCompletionsParams,
        | 'document'
        | 'promptChars'
        | 'isEmbeddingsContextEnabled'
        | 'contextFetcher'
        | 'getCodebaseContext'
        | 'documentHistory'
    > {
    docContext: DocumentContext
}

async function getCompletionContext({
    document,
    promptChars,
    isEmbeddingsContextEnabled,
    contextFetcher,
    getCodebaseContext,
    documentHistory,
    docContext: { prefix, suffix },
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
        prefix,
        suffix,
        history: documentHistory,
        jaccardDistanceWindowSize: SNIPPET_WINDOW_SIZE,
        maxChars: promptChars,
        getCodebaseContext,
        isEmbeddingsContextEnabled,
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
