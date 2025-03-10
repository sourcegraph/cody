import { currentResolvedConfig, dotcomTokenToGatewayToken } from '@sourcegraph/cody-shared'

import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import type { AutoeditModelOptions, AutoeditsModelAdapter, ModelResponse } from './base'
import {
    type AutoeditsRequestBody,
    type FireworksCompatibleRequestParams,
    getMaxOutputTokensForAutoedits,
    getModelResponse,
    getOpenaiCompatibleChatPrompt,
} from './utils'

export class CodyGatewayAdapter implements AutoeditsModelAdapter {
    public async getModelResponse(options: AutoeditModelOptions): Promise<ModelResponse> {
        const headers = {
            'X-Sourcegraph-Feature': 'code_completions',
        }
        const body = this.getMessageBody(options)
        try {
            const apiKey = await this.getApiKey()
            const { data, requestHeaders, responseHeaders, url } = await getModelResponse(
                options.url,
                JSON.stringify(body),
                apiKey,
                headers
            )

            let prediction: string
            if (options.isChatModel) {
                prediction = data.choices[0].message.content
            } else {
                prediction = data.choices[0].text
            }

            return {
                prediction,
                responseHeaders,
                requestHeaders,
                requestBody: body,
                requestUrl: url,
                responseBody: data,
            }
        } catch (error) {
            autoeditsOutputChannelLogger.logError('getModelResponse', 'Error calling Cody Gateway:', {
                verbose: error,
            })
            throw error
        }
    }

    private async getApiKey(): Promise<string> {
        const resolvedConfig = await currentResolvedConfig()
        // TODO (pkukielka): Check if fastpath should support custom auth providers and how
        const accessToken =
            resolvedConfig.auth.credentials && 'token' in resolvedConfig.auth.credentials
                ? resolvedConfig.auth.credentials.token
                : null
        const fastPathAccessToken = dotcomTokenToGatewayToken(accessToken)
        if (!fastPathAccessToken) {
            autoeditsOutputChannelLogger.logError('getApiKey', 'FastPath access token is not available')
            throw new Error('FastPath access token is not available')
        }
        return fastPathAccessToken
    }

    private getMessageBody(options: AutoeditModelOptions): AutoeditsRequestBody {
        const maxTokens = getMaxOutputTokensForAutoedits(options.codeToRewrite)
        const baseBody: FireworksCompatibleRequestParams = {
            stream: false,
            model: options.model,
            temperature: 0.1,
            max_tokens: maxTokens,
            response_format: {
                type: 'text',
            },
            prediction: {
                type: 'content',
                content: options.codeToRewrite,
            },
            user: options.userId || undefined,
        }

        if (options.isChatModel) {
            return {
                ...baseBody,
                messages: getOpenaiCompatibleChatPrompt({
                    systemMessage: options.prompt.systemMessage,
                    userMessage: options.prompt.userMessage,
                }),
            }
        }

        return {
            ...baseBody,
            prompt: options.prompt.userMessage,
        }
    }
}
