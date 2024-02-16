import type { CompletionLogger, CompletionsClientConfig } from '../sourcegraph-api/completions/client'
import type { CompletionParameters, CompletionResponse } from '../sourcegraph-api/completions/types'

/**
 * Marks the yielded value as an incomplete response.
 *
 * TODO: migrate to union of multiple `CompletionResponse` types to explicitly document
 * all possible response types.
 */
export enum CompletionStopReason {
    /**
     * Used to signal to the completion processing code that we're still streaming.
     * Can be removed if we make `CompletionResponse.stopReason` optional. Then
     * `{ stopReason: undefined }` can be used instead.
     */
    StreamingChunk = 'cody-streaming-chunk',
    RequestAborted = 'cody-request-aborted',
    RequestFinished = 'cody-request-finished',
}

export type CodeCompletionsParams = Omit<CompletionParameters, 'fast'> & { timeoutMs: number }
export type CompletionResponseGenerator = AsyncGenerator<CompletionResponse>

export interface CodeCompletionsClient<T = CodeCompletionsParams> {
    logger: CompletionLogger | undefined
    complete(params: T, abortController: AbortController): CompletionResponseGenerator
    onConfigurationChange(newConfig: CompletionsClientConfig): void
}
