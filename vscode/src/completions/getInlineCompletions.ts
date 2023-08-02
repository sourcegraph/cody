import * as vscode from 'vscode'
import { Range } from 'vscode-languageserver-textdocument'
import { URI } from 'vscode-uri'

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'

import { debug } from '../log'

import { GetContextOptions, GetContextResult } from './context'
import { DocumentContext, getCurrentDocContext } from './document'
import { DocumentHistory } from './history'
import * as CompletionLogger from './logger'
import { detectMultiline } from './multiline'
import { processInlineCompletions } from './processInlineCompletions'
import { CompletionProviderTracer, Provider, ProviderConfig, ProviderOptions } from './providers/provider'
import { RequestManager } from './request-manager'
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
    codebaseContext?: CodebaseContext
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
    logId: string

    /** The document URI for which this candidate was generated. */
    uri: URI

    /** The position at which this candidate was generated. */
    originalTriggerPosition: vscode.Position

    /** The full text of the line where this candidate was generated. */
    originalTriggerLineText: string

    /** The candidate completion item. */
    item: InlineCompletionItem
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

    /**
     * The user is typing as suggested by the last result. For example, if the user's editor shows
     * an inline completion `abc` ahead of the cursor, and the user types `a` then `b`, the original
     * completion will continue to display.
     *
     * The last suggestion is passed in {@link InlineCompletionsParams.lastCandidate}.
     */
    LastSuggestion,
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
    codebaseContext,
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
    if (lastCandidate) {
        // See test cases for the expected behaviors.
        const isSameDocument = lastCandidate.uri.toString() === document.uri.toString()
        const isSameLine = lastCandidate.originalTriggerPosition.line === position.line

        const candidateFullRange: Range = lastCandidate.item.range ?? {
            start: lastCandidate.originalTriggerPosition,
            end: lastCandidate.originalTriggerPosition,
        }

        // TODO(sqs): also check position?
        const candidateRangeOnFirstLine =
            candidateFullRange.start.line === candidateFullRange.end.line
                ? candidateFullRange
                : candidateFullRange.start.line === lastCandidate.originalTriggerPosition.line
                ? {
                      start: candidateFullRange.start,
                      end: {
                          line: candidateFullRange.start.line,
                          character: lastCandidate.originalTriggerLineText.length,
                      },
                  }
                : null
        const lineWithGhostText = candidateRangeOnFirstLine
            ? lastCandidate.originalTriggerLineText.slice(0, candidateRangeOnFirstLine.start.character) +
              lastCandidate.item.insertText +
              lastCandidate.originalTriggerLineText.slice(candidateRangeOnFirstLine.end.character)
            : lastCandidate.originalTriggerLineText

        const isCursorWithinGhostText = position.isAfterOrEqual(lastCandidate.originalTriggerPosition)
        const isSamePrefix = lastCandidate.item.insertText.startsWith(docContext.currentLinePrefix)
        const isAfterOriginalTrigger = isCursorWithinGhostText && isSamePrefix

        const isLineOnlyLeadingWhitespace =
            /^\s*$/.test(docContext.currentLinePrefix) && docContext.currentLineSuffix === ''

        if (isSameDocument && isSameLine && (isLineOnlyLeadingWhitespace || isAfterOriginalTrigger)) {
            return {
                // Reuse the logId to so that typing text of a displayed completion will not log a
                // new completion on every keystroke.
                logId: lastCandidate.logId,

                items: [
                    {
                        insertText: isAfterOriginalTrigger
                            ? lastCandidate.item.insertText.slice(docContext.currentLinePrefix.length)
                            : lastCandidate.item.insertText,
                    },
                ],
                source: InlineCompletionsResultSource.LastSuggestion,
            }
        }
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
        codebaseContext,
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

    // Get completions from providers
    const { completions, cacheHit } = await requestManager.request(
        { prefix: docContext.prefix },
        completionProviders,
        contextResult?.context ?? [],
        abortSignal,
        tracer ? createCompletionProviderTracer(tracer) : undefined
    )
    tracer?.({ cacheHit })

    if (abortSignal?.aborted) {
        return null
    }

    // Shared post-processing logic
    const processedCompletions = processInlineCompletions(
        completions.map(item => ({ insertText: item.content })),
        {
            document,
            position,
            multiline,
            docContext,
        }
    )
    logCompletions(logId, processedCompletions, document, context)
    return {
        logId,
        items: processedCompletions,
        source: cacheHit ? InlineCompletionsResultSource.Cache : InlineCompletionsResultSource.Network,
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
        | 'codebaseContext'
        | 'documentHistory'
    > {
    docContext: DocumentContext
}

async function getCompletionContext({
    document,
    promptChars,
    isEmbeddingsContextEnabled,
    contextFetcher,
    codebaseContext,
    documentHistory,
    docContext: { prefix, suffix },
}: GetCompletionContextParams): Promise<GetContextResult | null> {
    if (!contextFetcher) {
        return null
    }
    if (!codebaseContext) {
        throw new Error('codebaseContext is required if contextFetcher is provided')
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
        codebaseContext,
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
    context: vscode.InlineCompletionContext
): void {
    if (completions.length > 0) {
        // When the VS Code completion popup is open and we suggest a completion that does not match
        // the currently selected completion, VS Code won't display it. For now we make sure to not
        // log these completions as displayed.
        //
        // TODO: Take this into account when creating the completion prefix.
        let isCompletionVisible = true
        if (context.selectedCompletionInfo) {
            const currentText = document.getText(context.selectedCompletionInfo.range)
            const selectedText = context.selectedCompletionInfo.text
            if (!(currentText + completions[0].insertText).startsWith(selectedText)) {
                isCompletionVisible = false
            }
        }

        if (isCompletionVisible) {
            CompletionLogger.suggest(logId, isCompletionVisible)
        }
    } else {
        CompletionLogger.noResponse(logId)
    }
}
