import { forkSignal, generatorWithErrorObserver, generatorWithTimeout } from '../../completions/utils'
import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import type { AutoeditModelOptions, AutoeditsModelAdapter, ModelResponse } from './base'
import { getDefaultModelResponse } from './model-response/default'
import { getOpenaiCompatibleChatPrompt } from './utils'

export class OpenAIAdapter implements AutoeditsModelAdapter {
    dispose() {}

    async getModelResponse(options: AutoeditModelOptions): Promise<AsyncGenerator<ModelResponse>> {
        try {
            const apiKey = autoeditsProviderConfig.experimentalAutoeditsConfigOverride?.apiKey

            if (!apiKey) {
                autoeditsOutputChannelLogger.logError(
                    'getModelResponse',
                    'No api key provided in the config override'
                )
                throw new Error('No api key provided in the config override')
            }

            const abortController = forkSignal(options.abortSignal)
            return generatorWithErrorObserver(
                generatorWithTimeout(
                    getDefaultModelResponse({
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
                        extractPrediction: response => {
                            return response.responseBody.choices[0].message.content
                        },
                    }),
                    options.timeoutMs,
                    abortController
                ),
                error => {
                    autoeditsOutputChannelLogger.logError(
                        'getModelResponse',
                        'Error calling OpenAI API:',
                        {
                            verbose: error,
                        }
                    )
                    throw error
                }
            )
        } catch (error) {
            autoeditsOutputChannelLogger.logError('getModelResponse', 'Error calling OpenAI API:', {
                verbose: error,
            })
            throw error
        }
    }
}
