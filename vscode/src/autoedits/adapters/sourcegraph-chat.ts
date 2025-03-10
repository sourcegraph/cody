import type { ChatClient, Message } from '@sourcegraph/cody-shared'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { AutoeditModelOptions, AutoeditsModelAdapter, ModelResponse } from './base'
import { getMaxOutputTokensForAutoedits, getSourcegraphCompatibleChatPrompt } from './utils'

export class SourcegraphChatAdapter implements AutoeditsModelAdapter {
    constructor(private readonly chatClient: ChatClient) {}

    async getModelResponse(option: AutoeditModelOptions): Promise<ModelResponse> {
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
                    temperature: 0.1,
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

            // For direct API calls without HTTP headers, we return an empty object
            return {
                prediction: accumulated,
                responseHeaders: {},
                requestUrl: option.url,
            }
        } catch (error) {
            autoeditsOutputChannelLogger.logError(
                'getModelResponse',
                'Error calling Sourcegraph Chat:',
                {
                    verbose: error,
                }
            )
            throw error
        }
    }
}
