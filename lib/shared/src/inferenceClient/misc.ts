import type { CompletionLogger } from '../sourcegraph-api/completions/client'
import type {
    CompletionParameters,
    CompletionResponse,
    SerializedCompletionParameters,
} from '../sourcegraph-api/completions/types'
import type { BrowserOrNodeResponse } from '../sourcegraph-api/graphql/client'

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
export type SerializedCodeCompletionsParams = Omit<SerializedCompletionParameters, 'fast'>

export type CompletionResponseWithMetaData = {
    /**
     * The code completions backend API response.
     */
    completionResponse?: CompletionResponse
    metadata?: {
        /**
         * Yield response from HTTP clients to a logic shared across providers to
         * extract metadata required for analytics in one place.
         */
        response?: BrowserOrNodeResponse
    }
}

export type CompletionResponseGenerator = AsyncGenerator<
    CompletionResponseWithMetaData,
    CompletionResponseWithMetaData
>

export interface CodeCompletionProviderOptions {
    customHeaders?: Record<string, string>
}

export interface CodeCompletionsClient<
    T = CodeCompletionsParams,
    ProviderSpecificOptions = CodeCompletionProviderOptions,
> {
    logger: CompletionLogger | undefined
    complete(
        params: T,
        abortController: AbortController,
        providerOptions?: ProviderSpecificOptions
    ): CompletionResponseGenerator | Promise<CompletionResponseGenerator>
}
