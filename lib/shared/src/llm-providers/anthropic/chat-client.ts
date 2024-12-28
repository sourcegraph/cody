import Anthropic from '@anthropic-ai/sdk'
import type { ChatNetworkClientParams } from '..'
import { CompletionStopReason, contextFiltersProvider, getCompletionsModelConfig, onAbort } from '../..'
// import { logDebug } from '../../logger'

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
        metrics: {},
    }

    try {
        const messages = await (async () => {
            const rawMessages = await Promise.all(
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
            )

            const firstRole = rawMessages[0]?.role
            const groupedMessages = {
                user: [],
                assistant: [],
            } as Record<string, string[]>

            // Collect non-empty texts by role
            // biome-ignore lint/complexity/noForEach: <explanation>
            rawMessages.forEach(msg => {
                if (msg.content[0].text.trim()) {
                    groupedMessages[msg.role].push(msg.content[0].text)
                }
            })

            // Create array in the correct order based on first role
            const orderedRoles =
                firstRole === 'assistant' ? ['assistant', 'user'] : ['user', 'assistant']

            const ret = orderedRoles
                .filter(role => groupedMessages[role].length > 0)
                .map(role => ({
                    role,
                    content: [
                        {
                            type: 'text',
                            text: groupedMessages[role].join('\n\n'),
                            cache_control: { type: 'ephemeral' },
                        },
                    ],
                }))

            return ret
        })()
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
                // Track metrics
                const metrics = {
                    networkLatency: networkStart - requestStart,
                    processingTime: requestEnd - networkStart,
                    totalTime: requestEnd - requestStart,
                    usage: {
                        input_tokens: finalMessage.usage.input_tokens ?? -1,
                        output_tokens: finalMessage.usage.output_tokens ?? -1,
                        cache_creation_input_tokens: (finalMessage.usage as any)
                            .cache_creation_input_tokens,
                        cache_read_input_tokens: (finalMessage.usage as any).cache_read_input_tokens,
                    },
                }

                result.metrics = {
                    networkLatency: networkStart - requestStart,
                    processingTime: requestEnd - networkStart,
                    totalTime: requestEnd - requestStart,
                    usage: {
                        input_tokens: finalMessage?.usage?.input_tokens ?? 0,
                        output_tokens: finalMessage?.usage?.output_tokens ?? 0,
                        cache_creation_input_tokens: finalMessage?.usage?.cache_creation_input_tokens,
                        cache_read_input_tokens: finalMessage?.usage?.cache_read_input_tokens,
                    },
                }

                // Continue with existing stream handling
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
