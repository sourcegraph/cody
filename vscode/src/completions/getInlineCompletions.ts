import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'

import { debug } from '../log'

import { GetContextOptions, GetContextResult } from './context/context'
import { DocumentHistory } from './context/history'
import { DocumentContext, getCurrentDocContext } from './document'
import * as CompletionLogger from './logger'
import { detectMultiline } from './multiline'
import { CompletionProviderTracer, Provider, ProviderConfig, ProviderOptions } from './providers/provider'
import { RequestManager, RequestParams } from './request-manager'
import { reuseLastCandidate } from './reuse-last-candidate'
import { ProvideInlineCompletionsItemTraceData } from './tracer'
import { InlineCompletionItem } from './types'
import { isAbortError, SNIPPET_WINDOW_SIZE } from './utils'

export interface InlineCompletionsParams {
    // Context
    document: vscode.TextDocument
    position: vscode.Position
    context: vscode.InlineCompletionContext

    // Prompt parameters
    promptChars: number
    maxPrefixChars: number
    maxSuffixChars: number
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
        if (result) {
            debug('getInlineCompletions:result', InlineCompletionsResultSource[result.source])
        } else {
            debug('getInlineCompletions:noResult', '')
        }
        params.tracer?.({ result })
        return result
    } catch (unknownError: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const error = unknownError instanceof Error ? unknownError : new Error(unknownError as any)

        params.tracer?.({ error: error.toString() })

        if (isAbortError(error)) {
            debug('getInlineCompletions:error', error.message, { verbose: error })
            return null
        }

        throw error
    } finally {
        params.setIsLoading?.(false)
    }
}

async function doGetInlineCompletions({
    document,
    position,
    context,
    promptChars,
    maxPrefixChars,
    maxSuffixChars,
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
}: InlineCompletionsParams): Promise<InlineCompletionsResult | null> {
    tracer?.({ params: { document, position, context } })

    const docContext = getCurrentDocContext(document, position, maxPrefixChars, maxSuffixChars)
    if (!docContext) {
        return null
    }

    // If we have a suffix in the same line as the cursor and the suffix contains any word
    // characters, do not attempt to make a completion. This means we only make completions if
    // we have a suffix in the same line for special characters like `)]}` etc.
    //
    // VS Code will attempt to merge the remainder of the current line by characters but for
    // words this will easily get very confusing.
    if (/\w/.test(docContext.currentLineSuffix)) {
        return null
    }

    // Check if the user is typing as suggested by the last candidate completion (that is shown as
    // ghost text in the editor), and reuse it if it is still valid.
    const resultToReuse = lastCandidate ? reuseLastCandidate({ document, position, lastCandidate, docContext }) : null
    if (resultToReuse) {
        return resultToReuse
    }

    const multiline = detectMultiline(docContext, document.languageId, providerConfig.enableExtendedMultilineTriggers)

    // Only log a completion as started if it's either served from cache _or_ the debounce interval
    // has passed to ensure we don't log too many start events where we end up not doing any work at
    // all.
    CompletionLogger.clear()
    const logId = CompletionLogger.create({
        multiline,
        providerIdentifier: providerConfig.identifier,
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
        multiline,
        docContext,
        toWorkspaceRelativePath,
    })
    tracer?.({ completers: completionProviders.map(({ options }) => options) })

    CompletionLogger.networkRequestStarted(logId, contextResult?.logSummary ?? null)

    const reqContext: RequestParams = {
        document,
        docContext,
        position,
        multiline,
    }

    // Get the processed completions from providers
    const { completions, cacheHit } = await requestManager.request(
        reqContext,
        completionProviders,
        contextResult?.context ?? [],

        tracer ? createCompletionProviderTracer(tracer) : undefined
    )

    logCompletions(logId, completions, document, docContext, context, providerConfig, abortSignal)

    return {
        logId,
        items: completions,
        source:
            cacheHit === 'hit'
                ? InlineCompletionsResultSource.Cache
                : cacheHit === 'hit-after-request-started'
                ? InlineCompletionsResultSource.CacheAfterRequestStart
                : InlineCompletionsResultSource.Network,
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
    multiline: boolean
    docContext: DocumentContext
}

function getCompletionProviders({
    document,
    context,
    providerConfig,
    responsePercentage,
    prefixPercentage,
    suffixPercentage,
    multiline,
    docContext: { prefix, suffix },
    toWorkspaceRelativePath,
}: GetCompletionProvidersParams): Provider[] {
    const sharedProviderOptions: Omit<ProviderOptions, 'id' | 'n' | 'multiline'> = {
        prefix,
        suffix,
        fileName: toWorkspaceRelativePath(document.uri),
        languageId: document.languageId,
        responsePercentage,
        prefixPercentage,
        suffixPercentage,
    }
    if (multiline) {
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

function logCompletions(
    logId: string,
    completions: InlineCompletionItem[],
    document: vscode.TextDocument,
    docContext: DocumentContext,
    context: vscode.InlineCompletionContext,
    providerConfig: ProviderConfig,
    abortSignal: AbortSignal | undefined
): void {
    CompletionLogger.loaded(logId)

    // There are these cases when a completion is being returned here but won't
    // be displayed by VS Code.
    //
    // - When the abort signal was already triggered and a new completion
    //   request was stared.
    // - When the VS Code completion popup is open and we suggest a completion
    //   that does not match the currently selected completion. For now we make
    //   sure to not log these completions as displayed.
    //   TODO: Take this into account when creating the completion prefix.
    // - When no completions contains characters in the current line that are
    //   not in the current line suffix. Since VS Code will try to merge
    //   completion with the suffix, we have to do a per-character diff to test
    //   this.
    const isAborted = abortSignal ? abortSignal.aborted : false
    const isMatchingPopupItem = completionMatchesPopupItem(completions, document, context)
    const isMatchingSuffix = completionMatchesSuffix(completions, docContext, providerConfig)
    const isVisible = !isAborted && isMatchingPopupItem && isMatchingSuffix

    if (isVisible) {
        if (completions.length > 0) {
            CompletionLogger.suggested(logId)
        } else {
            CompletionLogger.noResponse(logId)
        }
    }
}

function completionMatchesPopupItem(
    completions: InlineCompletionItem[],
    document: vscode.TextDocument,
    context: vscode.InlineCompletionContext
): boolean {
    if (context.selectedCompletionInfo) {
        const currentText = document.getText(context.selectedCompletionInfo.range)
        const selectedText = context.selectedCompletionInfo.text
        if (completions.length > 0 && !(currentText + completions[0].insertText).startsWith(selectedText)) {
            return false
        }
    }
    return true
}

function completionMatchesSuffix(
    completions: InlineCompletionItem[],
    docContext: DocumentContext,
    providerConfig: ProviderConfig
): boolean {
    // Models that support infilling do not replace an existing suffix but
    // instead insert the completion only at the current cursor position. Thus,
    // we do not need to compare the suffix
    if (providerConfig.supportsInfilling) {
        return true
    }

    const suffix = docContext.currentLineSuffix

    for (const completion of completions) {
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
