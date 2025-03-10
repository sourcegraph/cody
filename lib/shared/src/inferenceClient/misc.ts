import type { LegacyModelRefStr, ModelRefStr } from '../models/modelsService'
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

export type CodeCompletionsParams = Omit<CompletionParameters, 'fast'> & {
    timeoutMs: number
    // TODO: apply the same type to the underlying `CompletionParameters`
    model?: LegacyModelRefStr | ModelRefStr
}
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
        /**
         * Optional request headers sent to the model API
         */
        requestHeaders?: Record<string, string>
        /**
         * URL used to make the request to the model API
         */
        requestUrl?: string
        /**
         * Optional request body sent to the model API
         */
        requestBody?: any
    }
}

export type CompletionResponseGenerator = AsyncGenerator<
    CompletionResponseWithMetaData,
    CompletionResponseWithMetaData
>

export interface CodeCompletionProviderOptions {
    /**
     * Custom headers to send with the HTTP request, in addition to the globally configured headers
     * on {@link ClientConfiguration.customHeaders}.
     */
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
