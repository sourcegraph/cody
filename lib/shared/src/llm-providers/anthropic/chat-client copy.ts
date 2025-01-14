// import Anthropic from '@anthropic-ai/sdk'
// import type { ChatNetworkClientParams } from '..'
// import { contextFiltersProvider, getCompletionsModelConfig } from '../..'
// // import { CompletionStopReason, contextFiltersProvider, getCompletionsModelConfig, onAbort } from '../..'
// import { logDebug } from '../../logger'
// interface CacheUsage {
//     // Current metrics
//     input_tokens: number
//     output_tokens: number
//     // Future cache metrics
//     cache_creation_input_tokens?: number
//     cache_read_input_tokens?: number
// }

// interface LatencyMetrics {
//     networkLatency: number
//     processingTime: number
//     totalTime: number
//     usage: CacheUsage
// }
// export default async function anthropicChatClient({
//     params,
//     cb,
//     completionsEndpoint,
//     logger,
//     signal,
// }: ChatNetworkClientParams): Promise<void> {
//     const requestStart = performance.now()
//     const networkStart = performance.now()
//     logDebug('ModelsService', 'INSIDE anthropic client')

//     const log = logger?.startCompletion(params, completionsEndpoint)
//     if (!params.model || !params.messages) {
//         throw new Error('Anthropic Client: No model or messages')
//     }

//     const config = getCompletionsModelConfig(params.model)
//     const model = config?.model ?? params.model
//     const apiKey = config?.key
//     if (!apiKey) {
//         throw new Error('Anthropic Client: No API key')
//     }

//     const anthropic = new Anthropic({ apiKey })
//     // const result = {
//     //     completion: '',
//     //     stopReason: CompletionStopReason.StreamingChunk,
//     //     metrics: {},
//     // }

// // █ ModelsService INSIDE anthropic client
// // █ ModelsService Input Tokens:: 863
// // █ ModelsService Output Tokens:: 217
// // █ ModelsService Cache Creation Tokens:: 0
// // █ ModelsService Cache Read Tokens:: 0
// // █ ModelsService networkLatency:: 0.0003330000035930425
// // █ ModelsService processingTime:: 6798.623749999999
// // █ ModelsService toalTime:: 6798.624083000002
// // █ ClientConfigSingleton refreshing configuration

//     try {
//         const messages = await (async () => {
//             const rawMessages = await Promise.all(
//                 params.messages.map(async msg => ({
//                     role: msg.speaker === 'human' ? 'user' : 'assistant',
//                     content: [
//                         {
//                             type: 'text',
//                             text: (await msg.text?.toFilteredString(contextFiltersProvider)) ?? '',
//                             cache_control: { type: 'ephemeral' },
//                         },
//                     ],
//                 }))
//             )

//             const firstRole = rawMessages[0]?.role
//             const groupedMessages = {
//                 user: [],
//                 assistant: [],
//             } as Record<string, string[]>

//             // Collect non-empty texts by role
//             // biome-ignore lint/complexity/noForEach: <explanation>
//             rawMessages.forEach(msg => {
//                 if (msg.content[0].text.trim()) {
//                     groupedMessages[msg.role].push(msg.content[0].text)
//                 }
//             })

//             // Create array in the correct order based on first role
//             const orderedRoles =
//                 firstRole === 'assistant' ? ['assistant', 'user'] : ['user', 'assistant']

//             const ret = orderedRoles
//                 .filter(role => groupedMessages[role].length > 0)
//                 .map(role => ({
//                     role,
//                     content: [
//                         {
//                             type: 'text',
//                             text: groupedMessages[role].join('\n\n'),
//                             cache_control: { type: 'ephemeral' },
//                         },
//                     ],
//                 }))

//             return ret
//         })()
//         const systemPrompt = messages[0]?.role !== 'user' ? messages.shift()?.content : ''

//         const response = await anthropic.beta.tools.messages.create({
//                 model,
//                 messages: messages as any,
//                 max_tokens: params.maxTokensToSample,
//                 temperature: params.temperature,
//                 top_k: params.topK,
//                 top_p: params.topP,
//                 stop_sequences: params.stopSequences,
//                 // stream: config?.stream || true,
//                 system: [
//                     {
//                         type: 'text',
//                         text: `${systemPrompt}`,
//                         cache_control: { type: 'ephemeral' },
//                     },
//                 ] as any,
//                 ...config?.options,
//             })
//         const requestEnd = performance.now()
//         // Extract both current and future cache metrics
//         const metrics: LatencyMetrics = {
//             networkLatency: networkStart - requestStart,
//             processingTime: requestEnd - networkStart,
//             totalTime: requestEnd - requestStart,
//             usage: {
//                 // Stream<Anthropic.Messages.MessageStreamEvent>
//                 input_tokens: response.usage.input_tokens,
//                 output_tokens: response.usage.output_tokens,
//                 // Future fields marked as optional
//                 cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens,
//                 cache_read_input_tokens: (response.usage as any).cache_read_input_tokens,
//             },
//         }
//         logDebug('ModelsService', 'Input Tokens:', metrics.usage.input_tokens)
//         logDebug('ModelsService', 'Output Tokens:', metrics.usage.output_tokens)
//         if (metrics.usage.cache_creation_input_tokens !== undefined) {
//             logDebug('ModelsService', 'Cache Creation Tokens:', metrics.usage.cache_creation_input_tokens)
//         }
//         if (metrics.usage.cache_read_input_tokens !== undefined) {
//             logDebug('ModelsService', 'Cache Read Tokens:', metrics.usage.cache_read_input_tokens)
//         }
//         logDebug('ModelsService', 'networkLatency:', metrics.networkLatency)
//         logDebug('ModelsService', 'processingTime:', metrics.processingTime)
//         logDebug('ModelsService', 'toalTime:', metrics.totalTime)

//         } catch (e) {        const error = new Error(`Anthropic Client Failed: ${e}`)
//         cb.onError(error, 500)
//         log?.onError(error.message)
//     }
// }
