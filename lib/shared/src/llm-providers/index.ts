import type { CompletionLogger } from '../sourcegraph-api/completions/client'
import type { CompletionCallbacks, CompletionParameters } from '../sourcegraph-api/completions/types'

export { useCustomChatClient } from './clients'

export type CompletionsModelConfig = {
    model: string
    key: string
    endpoint?: string
}

export interface ChatNetworkClientParams {
    params: CompletionParameters
    cb: CompletionCallbacks
    // This is used for logging as the completions request is sent to the provider's API
    completionsEndpoint: string
    logger?: CompletionLogger
    signal?: AbortSignal
}

export type ChatNetworkClient = (params: ChatNetworkClientParams) => Promise<void>
