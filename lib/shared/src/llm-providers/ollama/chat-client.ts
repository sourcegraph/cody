import { Ollama } from 'ollama/browser'
import type { ChatNetworkClientParams } from '..'
import { getCompletionsModelConfig } from '../..'
import { contextFiltersProvider } from '../../cody-ignore/context-filters-provider'
import { onAbort } from '../../common/abortController'
import { CompletionStopReason } from '../../inferenceClient/misc'
import path from 'path'
import fs from 'fs'

/**
 * Calls the Ollama API for chat completions with history.
 */
export async function ollamaChatClient({
    params,
    cb,
    completionsEndpoint,
    logger,
    signal,
}: ChatNetworkClientParams): Promise<void> {
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
                images: msg.images,
            }))
        )
        const imagePath = path.join(process.cwd(), '/Users/arafatkhan/Desktop/cody/a.png')
        const base64Image = `${fs.readFileSync(imagePath).toString('base64')}`
        if (params.base64Image !== undefined || base64Image !== undefined) {
            const lastUserMessage = messages.findLast(msg => msg.role === 'user')
            if (lastUserMessage) {
                lastUserMessage.images = [base64Image]
            }
        }

        ollama
            .chat({
                model,
                messages,
                options: {
                    temperature: params.temperature,
                    top_k: params.topK,
                    top_p: params.topP,
                    tfs_z: params.maxTokensToSample,
                    ...config?.options,
                },
                stream: config?.stream || true,
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
