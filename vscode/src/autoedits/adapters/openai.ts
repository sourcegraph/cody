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

            const { data, requestHeaders, responseHeaders, url } = await getModelResponse(
                options.url,
                JSON.stringify({
                    model: options.model,
                    messages: getOpenaiCompatibleChatPrompt({
                        systemMessage: options.prompt.systemMessage,
                        userMessage: options.prompt.userMessage,
                    }),
                    temperature: 0.5,
                    max_tokens: 256,
                    response_format: {
                        type: 'text',
                    },
                }),
                apiKey
            )

            return {
                prediction: data.choices[0].message.content,
                responseHeaders,
                requestHeaders,
                requestUrl: url,
            }
        } catch (error) {
            autoeditsOutputChannelLogger.logError('getModelResponse', 'Error calling OpenAI API:', {
                verbose: error,
            })
            throw error
        }
    }
}
