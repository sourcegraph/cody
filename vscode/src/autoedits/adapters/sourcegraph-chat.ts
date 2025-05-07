import type { ChatClient, Message } from '@sourcegraph/cody-shared'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import {
    type AutoeditModelOptions,
    AutoeditStopReason,
    type AutoeditsModelAdapter,
    type ModelResponse,
} from './base'
import {
    getMaxOutputTokensForAutoedits,
    getSourcegraphCompatibleChatPrompt,
    getSourcegraphRewriteSpeculationParams,
} from './utils'

export class SourcegraphChatAdapter implements AutoeditsModelAdapter {
    constructor(private readonly chatClient: ChatClient) {}
    dispose() {}

    async getModelResponse(option: AutoeditModelOptions): Promise<AsyncGenerator<ModelResponse>> {
        try {
            const maxTokens = getMaxOutputTokensForAutoedits(option.codeToRewrite)
            const messages: Message[] = getSourcegraphCompatibleChatPrompt({
                systemMessage: option.prompt.systemMessage,
                userMessage: option.prompt.userMessage,
            })

            return this.handleChatStream(option, messages, maxTokens)
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

    private async *handleChatStream(
        option: AutoeditModelOptions,
        messages: Message[],
        maxTokens: number
    ): AsyncGenerator<ModelResponse> {
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
                ...getSourcegraphRewriteSpeculationParams(),
            },
            option.abortSignal
        )

        let accumulated = ''
        for await (const msg of stream) {
            if (msg.type === 'change') {
                const newText = msg.text.slice(accumulated.length)
                accumulated += newText
                yield {
                    type: 'partial',
                    stopReason: AutoeditStopReason.StreamingChunk,
                    prediction: accumulated,
                    requestUrl: option.url,
                    requestHeaders: {},
                    responseHeaders: {},
                    responseBody: {},
                }
            } else if (msg.type === 'complete' || msg.type === 'error') {
                break
            }
        }

        // For direct API calls without HTTP headers, we return an empty object
        yield {
            type: 'success',
            stopReason: AutoeditStopReason.RequestFinished,
            prediction: accumulated,
            responseHeaders: {},
            responseBody: {},
            requestUrl: option.url,
            requestHeaders: {},
        }
    }
}
