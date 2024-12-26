import type { AutoEditsModelConfig, ChatClient } from '@sourcegraph/cody-shared'

import { autoeditsLogger } from '../logger'

import type { AutoeditsModelAdapter } from './base'
import { CodyGatewayAdapter } from './cody-gateway'
import { FireworksAdapter } from './fireworks'
import { OpenAIAdapter } from './openai'
import { SourcegraphChatAdapter } from './sourcegraph-chat'
import { SourcegraphCompletionsAdapter } from './sourcegraph-completions'

export function createAutoeditsModelAdapter({
    providerName,
    isChatModel,
    chatClient,
}: {
    providerName: AutoEditsModelConfig['provider']
    isChatModel: boolean
    chatClient: ChatClient
}): AutoeditsModelAdapter {
    switch (providerName) {
        case 'openai':
            return new OpenAIAdapter()
        case 'fireworks':
            return new FireworksAdapter()
        case 'cody-gateway':
            return new CodyGatewayAdapter()
        case 'sourcegraph':
            return isChatModel
                ? new SourcegraphChatAdapter(chatClient)
                : new SourcegraphCompletionsAdapter()
        default:
            autoeditsLogger.logDebug('Config', `Provider ${providerName} not supported`)
            throw new Error(`Provider ${providerName} not supported`)
    }
}
