import type { CompletionsClientConfig } from '../sourcegraph-api/completions/client'
import type { CompletionParameters, CompletionResponse } from '../sourcegraph-api/completions/types'

/**
 * Marks the yielded value as an incomplete response.
 *
 * TODO: migrate to union of multiple `CompletionResponse` types to explicitly document
 * all possible response types.
 */
export enum CompletionStopReason {
    StreamingChunk = 'cody-streaming-chunk',
    RequestAborted = 'cody-request-aborted',
    RequestFinished = 'cody-request-finished',
}

export type CodeCompletionsParams = Omit<CompletionParameters, 'fast'> & { timeoutMs: number }
export type CompletionResponseGenerator = AsyncGenerator<CompletionResponse>

export interface CodeCompletionsClient<T = CodeCompletionsParams> {
    complete(params: T, abortController: AbortController): CompletionResponseGenerator
    onConfigurationChange(newConfig: CompletionsClientConfig): void
}
