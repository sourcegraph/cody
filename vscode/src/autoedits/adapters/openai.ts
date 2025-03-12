import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import type { AutoeditModelOptions, AutoeditsModelAdapter, ModelResponse } from './base'
import { getModelResponse, getOpenaiCompatibleChatPrompt } from './utils'

export class OpenAIAdapter implements AutoeditsModelAdapter {
    async getModelResponse(options: AutoeditModelOptions): Promise<ModelResponse> {
        try {
            const apiKey = autoeditsProviderConfig.experimentalAutoeditsConfigOverride?.apiKey

            if (!apiKey) {
                autoeditsOutputChannelLogger.logError(
                    'getModelResponse',
                    'No api key provided in the config override'
                )
                throw new Error('No api key provided in the config override')
            }

            const response = await getModelResponse({
                url: options.url,
                body: {
                    model: options.model,
                    messages: getOpenaiCompatibleChatPrompt({
                        systemMessage: options.prompt.systemMessage,
                        userMessage: options.prompt.userMessage,
                    }),
                    temperature: 0.1,
                    max_tokens: 256,
                    response_format: {
                        type: 'text',
                    },
                    stream: false,
                    prediction: {
                        type: 'content',
                        content: options.codeToRewrite,
                    },
                },
                apiKey,
                abortSignal: options.abortSignal,
            })

            if (response.type === 'aborted') {
                return response
            }

            return {
                ...response,
                prediction: response.responseBody.choices[0].message.content,
            }
        } catch (error) {
            autoeditsOutputChannelLogger.logError('getModelResponse', 'Error calling OpenAI API:', {
                verbose: error,
            })
            throw error
        }
    }
}
