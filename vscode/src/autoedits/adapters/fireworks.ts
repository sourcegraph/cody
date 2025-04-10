import { forkSignal, generatorWithErrorObserver, generatorWithTimeout } from '../../completions/utils'
import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import type { AutoeditModelOptions, AutoeditsModelAdapter, ModelResponse } from './base'
import { getFireworksModelResponse } from './model-response/fireworks'
import {
    type AutoeditsRequestBody,
    type FireworksCompatibleRequestParams,
    getMaxOutputTokensForAutoedits,
    getOpenaiCompatibleChatPrompt,
} from './utils'

export class FireworksAdapter implements AutoeditsModelAdapter {
    private readonly defaultTimeoutMs = 5000

    async getModelResponse(option: AutoeditModelOptions): Promise<AsyncGenerator<ModelResponse>> {
        const requestBody = this.getMessageBody(option)
        try {
            const apiKey = autoeditsProviderConfig.experimentalAutoeditsConfigOverride?.apiKey

            if (!apiKey) {
                autoeditsOutputChannelLogger.logError(
                    'getModelResponse',
                    'No api key provided in the config override'
                )
                throw new Error('No api key provided in the config override')
            }

            const abortController = forkSignal(option.abortSignal)
            return generatorWithErrorObserver(
                generatorWithTimeout(
                    getFireworksModelResponse({
                        apiKey,
                        url: option.url,
                        body: requestBody,
                        abortSignal: option.abortSignal,
                        extractPrediction: response => {
                            if (option.isChatModel) {
                                return response.choices?.[0]?.message?.content ?? ''
                            }
                            return response.choices?.[0]?.text ?? ''
                        },
                    }),
                    option.timeoutMs ?? this.defaultTimeoutMs,
                    abortController
                ),
                error => {
                    autoeditsOutputChannelLogger.logError(
                        'getModelResponse',
                        'Error calling Fireworks API:',
                        {
                            verbose: error,
                        }
                    )
                    throw error
                }
            )
        } catch (error) {
            autoeditsOutputChannelLogger.logError('getModelResponse', 'Error calling Fireworks API:', {
                verbose: error,
            })
            throw error
        }
    }

    dispose() {}

    private getMessageBody(options: AutoeditModelOptions): AutoeditsRequestBody {
        const maxTokens = getMaxOutputTokensForAutoedits(options.codeToRewrite)
        const baseParams: FireworksCompatibleRequestParams = {
            stream: true,
            model: options.model,
            temperature: 0.1,
            max_tokens: maxTokens,
            response_format: {
                type: 'text',
            },
            // Fireworks Predicted outputs
            // https://docs.fireworks.ai/guides/querying-text-models#predicted-outputs
            prediction: {
                type: 'content',
                content: options.codeToRewrite,
            },
            rewrite_speculation: true,
            adaptive_speculation: true,
            user: options.userId || undefined,
        }

        if (options.isChatModel) {
            return {
                ...baseParams,
                messages: getOpenaiCompatibleChatPrompt({
                    systemMessage: options.prompt.systemMessage,
                    userMessage: options.prompt.userMessage,
                }),
            }
        }

        return {
            ...baseParams,
            prompt: options.prompt.userMessage,
        }
    }
}
