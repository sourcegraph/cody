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
    const requestStart = performance.now()
    const networkStart = performance.now()

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
                content: [
                    {
                        type: 'text',
                        text: (await msg.text?.toFilteredString(contextFiltersProvider)) ?? '',
                        cache_control: { type: 'ephemeral' },
                    },
                ],
            }))
        )) as MessageParam[]
        // Turns the first assistant message into a system prompt
        const systemPrompt = messages[0]?.role !== 'user' ? messages.shift()?.content : ''

        anthropic.beta.tools.messages
            .create({
                model,
                messages,
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
                        cache_control: { type: 'ephemeral' },
                    },
                ] as any,
                ...config?.options,
            })
            .then(async stream => {
                onAbort(signal, () => stream.controller.abort())
                const requestEnd = performance.now()
                let finalMessage: any

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
                        finalMessage = messageStreamEvent
                        break
                    }
                }

                cb.onComplete()
                log?.onComplete(result)
                // Track metrics
                const metrics = {
                    networkLatency: networkStart - requestStart,
                    processingTime: requestEnd - networkStart,
                    totalTime: requestEnd - requestStart,
                    usage: {
                        input_tokens: finalMessage.usage.input_tokens,
                        output_tokens: finalMessage.usage.output_tokens,
                        cache_creation_input_tokens: (finalMessage.usage as any)
                            .cache_creation_input_tokens,
                        cache_read_input_tokens: (finalMessage.usage as any).cache_read_input_tokens,
                    },
                }

                // Log metrics
                console.log('Cache Performance Metrics:')
                console.log('Input Tokens:', metrics.usage.input_tokens)
                console.log('Output Tokens:', metrics.usage.output_tokens)
                if (metrics.usage.cache_creation_input_tokens !== undefined) {
                    console.log('Cache Creation Tokens:', metrics.usage.cache_creation_input_tokens)
                }
                if (metrics.usage.cache_read_input_tokens !== undefined) {
                    console.log('Cache Read Tokens:', metrics.usage.cache_read_input_tokens)
                }
                console.log('networkLatency:', metrics.networkLatency)
                console.log('processingTime:', metrics.processingTime)
                console.log('totalTime:', metrics.totalTime)
                console.log('---\n')

                // Continue with existing stream handling
                onAbort(signal, () => stream.controller.abort())
            })
    } catch (e) {
        const error = new Error(`Anthropic Client Failed: ${e}`)
        cb.onError(error, 500)
        log?.onError(error.message)
    }
}
