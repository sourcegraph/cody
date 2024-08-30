import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { ChatNetworkClientParams } from '..'
import { CompletionStopReason, contextFiltersProvider, getCompletionsModelConfig, onAbort } from '../..'

export async function anthropicChatClient({
    params,
    cb,
    completionsEndpoint,
    logger,
    signal,
}: ChatNetworkClientParams): Promise<void> {
    const log = logger?.startCompletion(params, completionsEndpoint)
    if (!params.model || !params.messages) {
        throw new Error('Anthropic Client: No model or messages')
    }

    const config = getCompletionsModelConfig(params.model)
    const model = config?.model ?? params.model
    const apiKey = config?.key
    if (!apiKey) {
        throw new Error('Anthropic Client: No API key')
    }

    const anthropic = new Anthropic({ apiKey })
    const result = {
        completion: '',
        stopReason: CompletionStopReason.StreamingChunk,
    }

    try {
        const messages = (await Promise.all(
            params.messages.map(async msg => ({
                role: msg.speaker === 'human' ? 'user' : 'assistant',
                content: (await msg.text?.toFilteredString(contextFiltersProvider.instance!)) ?? '',
            }))
        )) as MessageParam[]
        // Turns the first assistant message into a system prompt
        const systemPrompt = messages[0]?.role !== 'user' ? messages.shift()?.content : ''

        anthropic.messages
            .create({
                model,
                messages,
                max_tokens: params.maxTokensToSample,
                temperature: params.temperature,
                top_k: params.topK,
                top_p: params.topP,
                stop_sequences: params.stopSequences,
                stream: true,
                system: `${systemPrompt}`,
            })
            .then(async stream => {
                onAbort(signal, () => stream.controller.abort())

                for await (const messageStreamEvent of stream) {
                    if (messageStreamEvent.type === 'content_block_delta') {
                        result.completion += messageStreamEvent.delta.text
                        cb.onChange(result.completion)
                    }

                    if (signal?.aborted) {
                        result.stopReason = CompletionStopReason.RequestAborted
                        break
                    }

                    if (messageStreamEvent.type === 'message_stop') {
                        break
                    }
                }

                cb.onComplete()
                log?.onComplete(result)
            })
    } catch (e) {
        const error = new Error(`Anthropic Client Failed: ${e}`)
        cb.onError(error, 500)
        log?.onError(error.message)
    }
}
