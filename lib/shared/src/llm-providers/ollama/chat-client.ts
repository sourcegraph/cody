import { Ollama } from 'ollama/browser'
import { getCompletionsModelConfig } from '../..'
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

    if (!params.model || !params.messages) {
        log?.onError('No model or messages')
        throw new Error('No model or messages')
    }

    const config = getCompletionsModelConfig(params.model)
    const model = config?.model ?? params.model
    const endpoint = config?.endpoint

    // Update the host if it's different from the current one.
    const ollama = new Ollama({ host: endpoint })
    const result = {
        completion: '',
        stopReason: CompletionStopReason.StreamingChunk,
    }

    onAbort(signal, () => ollama.abort())

    try {
        const messages = await Promise.all(
            params.messages.map(async msg => ({
                role: msg.speaker === 'human' ? 'user' : 'assistant',
                content: (await msg.text?.toFilteredString(contextFiltersProvider)) ?? '',
            }))
        )

        ollama
            .chat({
                model,
                messages,
                options: {
                    temperature: params.temperature,
                    top_k: params.topK,
                    top_p: params.topP,
                    tfs_z: params.maxTokensToSample,
                },
                stream: true,
            })
            .then(
                async res => {
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
                    throw err
                }
            )
    } catch (e) {
        const error = new Error(`Ollama Client Failed: ${e}`)
        cb.onError(error, 500)
        log?.onError(error.message)
    }
}
