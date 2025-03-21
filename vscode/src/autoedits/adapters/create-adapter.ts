import type { AutoEditsModelConfig, ChatClient } from '@sourcegraph/cody-shared'

import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import type { AutoeditsModelAdapter } from './base'
import { CodyGatewayAdapter } from './cody-gateway'
import { FireworksAdapter } from './fireworks'
import { FireworksWebSocketAdapter } from './fireworks-websocket'
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
        case 'fireworks-websocket':
            // if (
            //     featureFlagProvider.evaluatedFeatureFlag(
            //         FeatureFlag.CodyAutoEditUseWebSocketForFireworksConnections
            //     )
            // ) {
            return new FireworksWebSocketAdapter()
        // }
        // throw new Error('user is not opted into fireworks-websocket feature')
        case 'cody-gateway':
            return new CodyGatewayAdapter()
        case 'sourcegraph':
            return isChatModel
                ? new SourcegraphChatAdapter(chatClient)
                : new SourcegraphCompletionsAdapter()
        default:
            autoeditsOutputChannelLogger.logError(
                'createAutoeditsModelAdapter',
                `Provider ${providerName} not supported`
            )
            throw new Error(`Provider ${providerName} not supported`)
    }
}
