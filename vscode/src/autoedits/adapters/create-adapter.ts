import {
    type AutoEditsModelConfig,
    type ChatClient,
    currentAuthStatusOrNotReadyYet,
    isS2,
} from '@sourcegraph/cody-shared'

import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import { autoeditsProviderConfig } from '../autoedits-config'
import type { AutoeditsModelAdapter } from './base'
import { CodyGatewayAdapter } from './cody-gateway'
import { FireworksAdapter } from './fireworks'
import { FireworksWebSocketAdapter } from './fireworks-websocket'
import { InceptionLabsAdapter } from './inceptionlabs'
import { OpenAIAdapter } from './openai'
import { SourcegraphChatAdapter } from './sourcegraph-chat'
import { SourcegraphCompletionsAdapter } from './sourcegraph-completions'

export function createAutoeditsModelAdapter({
    providerName,
    isChatModel,
    chatClient,
    allowUsingWebSocket,
}: {
    providerName: AutoEditsModelConfig['provider']
    isChatModel: boolean
    chatClient: ChatClient
    allowUsingWebSocket?: boolean
}): AutoeditsModelAdapter {
    const authStatus = currentAuthStatusOrNotReadyYet()
    const forceWebSocketProxy =
        allowUsingWebSocket && Boolean(authStatus?.authenticated && isS2(authStatus))
    if (forceWebSocketProxy) {
        const webSocketEndpoint =
            autoeditsProviderConfig.experimentalAutoeditsConfigOverride?.webSocketEndpoint ??
            'wss://fine-tunes-proxy.sgdev.org'
        return new FireworksWebSocketAdapter(webSocketEndpoint)
    }
    switch (providerName) {
        case 'inceptionlabs':
            return new InceptionLabsAdapter()
        case 'openai':
            return new OpenAIAdapter()
        case 'fireworks':
            return new FireworksAdapter()
        case 'fireworks-websocket':
            if (allowUsingWebSocket) {
                return new FireworksWebSocketAdapter(
                    autoeditsProviderConfig.experimentalAutoeditsConfigOverride?.webSocketEndpoint
                )
            }
            throw new Error('user is not opted into fireworks-websocket feature')
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
