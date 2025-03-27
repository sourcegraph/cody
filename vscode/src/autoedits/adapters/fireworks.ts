import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import type {
    AbortedModelResponse,
    AutoeditModelOptions,
    AutoeditsModelAdapter,
    ModelResponse,
    ModelResponseShared,
    SuccessModelResponse,
} from './base'
import {
    type AutoeditsRequestBody,
    type FireworksCompatibleRequestParams,
    getMaxOutputTokensForAutoedits,
    getModelResponse,
    getOpenaiCompatibleChatPrompt,
} from './utils'

export class FireworksAdapter implements AutoeditsModelAdapter {
    async getModelResponse(option: AutoeditModelOptions): Promise<ModelResponse> {
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
            const response = await this.sendModelRequest({
                url: option.url,
                body: requestBody,
                apiKey,
                abortSignal: option.abortSignal,
            })

            if (response.type === 'aborted') {
                return response
            }

            let prediction: string
            if (option.isChatModel) {
                prediction = response.responseBody.choices[0].message.content
            } else {
                prediction = response.responseBody.choices[0].text
            }

            return {
                ...response,
                prediction,
            }
        } catch (error) {
            autoeditsOutputChannelLogger.logError('getModelResponse', 'Error calling Fireworks API:', {
                verbose: error,
            })
            throw error
        }
    }

    dispose() {}

    protected async sendModelRequest({
        apiKey,
        url,
        body,
        abortSignal,
        customHeaders = {},
    }: {
        apiKey: string
        url: string
        body: ModelResponseShared['requestBody']
        abortSignal: AbortSignal
        customHeaders?: Record<string, string>
    }): Promise<Omit<SuccessModelResponse, 'prediction'> | AbortedModelResponse> {
        return getModelResponse({
            apiKey,
            url,
            body,
            abortSignal,
            customHeaders,
        })
    }

    private getMessageBody(options: AutoeditModelOptions): AutoeditsRequestBody {
        const maxTokens = getMaxOutputTokensForAutoedits(options.codeToRewrite)
        const baseParams: FireworksCompatibleRequestParams = {
            stream: false,
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
