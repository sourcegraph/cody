import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { ChatNetworkClientParams } from '..'
import { CompletionStopReason, contextFiltersProvider, getCompletionsModelConfig, onAbort } from '../..'
import { logDebug } from '../../logger'

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
            params.messages.map(async msg => {
                const contentText = (await msg.text?.toFilteredString(contextFiltersProvider)) ?? ''
                return {
                    role: msg.speaker === 'human' ? 'user' : 'assistant',
                    content: contentText.includes('Codebase context from')
                        ? ([
                              {
                                  type: 'text',
                                  text: contentText,
                                  cache_control: { type: 'ephemeral' },
                              },
                          ] as any)
                        : contentText,
                }
            })
        )) as MessageParam[]

        const systemPrompt = messages[0]?.role !== 'user' ? messages.shift()?.content : ''

        anthropic.beta.tools.messages
            .create({
                model,
                messages: messages as any,
                max_tokens: params.maxTokensToSample,
                temperature: params.temperature,
                top_k: params.topK,
                top_p: params.topP,
                stop_sequences: params.stopSequences,
                stream: config?.stream || true,
                system: [
                    {
                        type: 'text',
                        text: `${systemPrompt}`,
                    },
                ] as any,
                ...config?.options,
            })
            .then(async stream => {
                onAbort(signal, () => stream.controller.abort())
                for await (const messageStreamEvent of stream) {
                    if (messageStreamEvent.type === 'message_start') {
                        // Capture initial usage metrics
                        logDebug(
                            'promptCachingMetrics',
                            'input_tokens:',
                            messageStreamEvent.message.usage.input_tokens
                        )
                        logDebug(
                            'promptCachingMetrics',
                            'output_tokens:',
                            messageStreamEvent.message.usage.output_tokens
                        )
                        logDebug(
                            'promptCachingMetrics',
                            'cache_creation_input_tokens:',
                            (messageStreamEvent.message.usage as any).cache_creation_input_tokens
                        )
                        logDebug(
                            'promptCachingMetrics',
                            'cache_read_input_tokens:',
                            (messageStreamEvent.message.usage as any).cache_read_input_tokens
                        )
                    }
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
                onAbort(signal, () => stream.controller.abort())
                cb.onComplete()
                log?.onComplete(result)
            })
    } catch (e) {
        const error = new Error(`Anthropic Client Failed: ${e}`)
        cb.onError(error, 500)
        log?.onError(error.message)
    }
}
