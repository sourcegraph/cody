import type { ChatClient, Message } from '@sourcegraph/cody-shared'
import { autoeditsLogger } from '../logger'
import type { AutoeditsModelAdapter } from '../prompt-provider'
import type { AutoeditModelOptions } from '../prompt-provider'
import { getSourcegraphCompatibleChatPrompt } from './utils'

export class SourcegraphChatAdapter implements AutoeditsModelAdapter {
    constructor(private readonly chatClient: ChatClient) {}

    async getModelResponse(option: AutoeditModelOptions): Promise<string> {
        try {
            const messages: Message[] = getSourcegraphCompatibleChatPrompt(
                option.prompt.systemMessage,
                option.prompt.userMessage
            )
            const stream = await this.chatClient.chat(
                messages,
                {
                    model: option.model,
                    maxTokensToSample: 256,
                    temperature: 0.2,
                },
                new AbortController().signal
            )

            let accumulated = ''
            for await (const msg of stream) {
                if (msg.type === 'change') {
                    const newText = msg.text.slice(accumulated.length)
                    accumulated += newText
                } else if (msg.type === 'complete' || msg.type === 'error') {
                    break
                }
            }
            return accumulated
        } catch (error) {
            autoeditsLogger.logDebug('AutoEdits', 'Error calling Sourcegraph Chat:', error)
            throw error
        }
    }
}
