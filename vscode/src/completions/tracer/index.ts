import * as vscode from 'vscode'

import { CompletionParameters } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { GetContextResult } from '../context'
import { CompletionProviderTracerResultData, Provider } from '../providers/provider'

/**
 * Traces invocations of {@link CodyCompletionItemProvider.provideInlineCompletionItems}.
 *
 * The tracer API assumes that only a single in-flight completion request can exist at a time.
 *
 * The tracer function is called when there is an update to the trace data. Because only a single
 * in-flight request can exist at a time, this call will overwrite the previous trace data.
 */
export type ProvideInlineCompletionItemsTracer = (data: ProvideInlineCompletionsItemTraceData) => void

/**
 * Trace data for a completion request.
 *
 * This type is intentionally tied to the implementation of the completion provider (so that you can
 * trace its execution), and it should change if the provider implementation changes.
 */
export interface ProvideInlineCompletionsItemTraceData {
    invocationSequence: number
    params?: {
        document: vscode.TextDocument
        position: vscode.Position
        context: vscode.InlineCompletionContext
    }
    completers?: Provider['options'][]

    /**
     * @todo Make this support recording more than 1 call to a completion provider.
     */
    completionProviderCallParams?: CompletionParameters
    completionProviderCallResult?: CompletionProviderTracerResultData

    context?: GetContextResult
    result?: vscode.InlineCompletionList
    cacheHit?: boolean
    error?: string
}
