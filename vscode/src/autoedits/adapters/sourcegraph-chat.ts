import type { ChatClient, Message } from '@sourcegraph/cody-shared'
import { autoeditsLogger } from '../logger'
import type { AutoeditsModelAdapter } from '../prompt-provider'
import type { AutoeditModelOptions } from '../prompt-provider'
import { getMaxOutputTokensForAutoedits, getSourcegraphCompatibleChatPrompt } from './utils'

export class SourcegraphChatAdapter implements AutoeditsModelAdapter {
    constructor(private readonly chatClient: ChatClient) {}

    async getModelResponse(option: AutoeditModelOptions): Promise<string> {
        try {
            const maxTokens = getMaxOutputTokensForAutoedits(option.codeToRewrite)
            const messages: Message[] = getSourcegraphCompatibleChatPrompt({
                systemMessage: option.prompt.systemMessage,
                userMessage: option.prompt.userMessage,
            })
            const stream = await this.chatClient.chat(
                messages,
                {
                    model: option.model,
                    maxTokensToSample: maxTokens,
                    temperature: 0.2,
                    prediction: {
                        type: 'content',
                        content: option.codeToRewrite,
                    },
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
