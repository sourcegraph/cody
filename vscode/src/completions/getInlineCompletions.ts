import path from 'path'

import * as vscode from 'vscode'

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

    // Injected
    contextFetcher?: (options: GetContextOptions) => Promise<GetContextResult>
    codebaseContext: CodebaseContext
    documentHistory: DocumentHistory

    // Shared
    requestManager: RequestManager

    // UI
    setIsLoading?: (isLoading: boolean) => void

    // Execution
    abortSignal?: AbortSignal
    tracer?: (data: Partial<ProvideInlineCompletionsItemTraceData>) => void
}

export interface InlineCompletionsResult {
    source: InlineCompletionsResultSource
    items: InlineCompletionItem[]
}

/**
 * The source of the inline completions.
 */
export enum InlineCompletionsResultSource {
    Network,
    Cache,
    TypingAsSuggested,
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
        debug('getInlineCompletions:error', error.message, { verbose: error })

        if (isAbortError(error)) {
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
    contextFetcher,
    codebaseContext,
    documentHistory,
    requestManager,
    setIsLoading,
    abortSignal,
    tracer,
}: InlineCompletionsParams): Promise<InlineCompletionsResult | null> {
    tracer?.({ params: { document, position, context } })

    // TODO(sqs): add CompletionLogger stuff

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

    const multiline = detectMultiline(
        docContext.prefix,
        docContext.prevNonEmptyLine,
        docContext.currentLinePrefix,
        docContext.currentLineSuffix,
        document.languageId,
        providerConfig.enableExtendedMultilineTriggers
    )

    tracer?.({ cacheHit: false })

    setIsLoading?.(true)

    // Fetch context
    const contextResult = await getCompletionContext({
        document,
        promptChars,
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
    })
    tracer?.({ completers: completionProviders.map(({ options }) => options) })

    // Get completions from providers
    const logId = '_' // TODO(sqs): set a logId
    const completionItems = await requestManager.request(
        document.uri.toString(),
        logId,
        { prefix: docContext.prefix },
        completionProviders,
        contextResult?.context ?? [],
        abortSignal,
        tracer ? createCompletionProviderTracer(tracer) : undefined
    )
    const compItems2 = completionItems.map(item => ({ insertText: item.content })) // TODO(sqs)

    // Shared post-processing logic
    const processedCompletions = processInlineCompletions(compItems2, { document, multiline, docContext })
    if (processedCompletions.length > 0) {
        CompletionLogger.suggest(logId)
    } else {
        CompletionLogger.noResponse(logId)
    }
    return {
        items: processedCompletions,
        source: InlineCompletionsResultSource.Network, // TODO(sqs)
    }
}

interface GetCompletionProvidersParams
    extends Pick<
        InlineCompletionsParams,
        'document' | 'context' | 'providerConfig' | 'responsePercentage' | 'prefixPercentage' | 'suffixPercentage'
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
}: GetCompletionProvidersParams): Provider[] {
    const sharedProviderOptions: Omit<ProviderOptions, 'id' | 'n' | 'multiline'> = {
        prefix,
        suffix,
        fileName: path.normalize(vscode.workspace.asRelativePath(document.fileName ?? '')),
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
        'document' | 'promptChars' | 'contextFetcher' | 'codebaseContext' | 'documentHistory'
    > {
    docContext: DocumentContext
}

async function getCompletionContext({
    document,
    promptChars,
    contextFetcher,
    codebaseContext,
    documentHistory,
    docContext: { prefix, suffix },
}: GetCompletionContextParams): Promise<GetContextResult | null> {
    if (!contextFetcher) {
        return null
    }

    return contextFetcher({
        document,
        prefix,
        suffix,
        history: documentHistory,
        jaccardDistanceWindowSize: SNIPPET_WINDOW_SIZE,
        maxChars: promptChars,
        codebaseContext,
        isEmbeddingsContextEnabled: true, // TODO(sqs): make this configurable?
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
