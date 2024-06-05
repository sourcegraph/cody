import ollama from 'ollama/browser'
import type { OllamaChatParams } from '.'
import { contextFiltersProvider } from '../../cody-ignore/context-filters-provider'
import { onAbort } from '../../common/abortController'
import { CompletionStopReason } from '../../inferenceClient/misc'
import type { CompletionLogger } from '../../sourcegraph-api/completions/client'
import type { CompletionCallbacks, CompletionParameters } from '../../sourcegraph-api/completions/types'

/**
 * Calls the Ollama API for chat completions with history.
 */
export async function ollamaChatClient(
    params: CompletionParameters,
    cb: CompletionCallbacks,
    // This is used for logging as the completions request is sent to the provider's API
    completionsEndpoint: string,
    logger?: CompletionLogger,
    signal?: AbortSignal
): Promise<void> {
    const log = logger?.startCompletion(params, completionsEndpoint)
    const model = params.model?.replace('ollama/', '')
    if (!model || !params.messages) {
        log?.onError('No model or messages')
        throw new Error('No model or messages')
    }

    const ollamaChatParams = {
        model,
        messages: await Promise.all(
            params.messages.map(async msg => {
                return {
                    role: msg.speaker === 'human' ? 'user' : 'assistant',
                    content: (await msg.text?.toFilteredString(contextFiltersProvider)) ?? '',
                }
            })
        ),
        options: {
            temperature: params.temperature,
            top_k: params.topK,
            top_p: params.topP,
            tfs_z: params.maxTokensToSample,
        },
        stream: true,
    } satisfies OllamaChatParams

    const result = {
        completion: '',
        stopReason: CompletionStopReason.StreamingChunk,
    }

    onAbort(signal, () => ollama.abort())

    ollama.chat(ollamaChatParams).then(
        async res => {
            // res is AsyncGenerator<CompletionResponse>
            for await (const part of res) {
                result.completion += part.message.content
                cb.onChange(result.completion)

                if (signal?.aborted) {
                    result.stopReason = CompletionStopReason.RequestAborted
                    ollama.abort()
                    break
                }

                if (part.done) {
                    result.stopReason = CompletionStopReason.RequestFinished
                    cb.onComplete()
                }
            }
            log?.onComplete(result)
        },
        err => {
            cb.onError(err, 500)
            throw err
        }
    )
}
