import { currentResolvedConfig, dotcomTokenToGatewayToken } from '@sourcegraph/cody-shared'

import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import type { AutoeditModelOptions, AutoeditsModelAdapter } from './base'
import {
    type FireworksCompatibleRequestParams,
    getMaxOutputTokensForAutoedits,
    getModelResponse,
    getOpenaiCompatibleChatPrompt,
} from './utils'

export class CodyGatewayAdapter implements AutoeditsModelAdapter {
    public async getModelResponse(options: AutoeditModelOptions): Promise<string> {
        const headers = {
            'X-Sourcegraph-Feature': 'code_completions',
        }
        const body = this.getMessageBody(options)
        try {
            const apiKey = await this.getApiKey()
            const response = await getModelResponse(options.url, body, apiKey, headers)
            if (options.isChatModel) {
                return response.choices[0].message.content
            }
            return response.choices[0].text
        } catch (error) {
            autoeditsOutputChannelLogger.logError('getModelResponse', 'Error calling Cody Gateway:', {
                verbose: error,
            })
            throw error
        }
    }

    private async getApiKey(): Promise<string> {
        const resolvedConfig = await currentResolvedConfig()
        const fastPathAccessToken = dotcomTokenToGatewayToken(resolvedConfig.auth.accessToken)
        if (!fastPathAccessToken) {
            autoeditsOutputChannelLogger.logError('getApiKey', 'FastPath access token is not available')
            throw new Error('FastPath access token is not available')
        }
        return fastPathAccessToken
    }

    private getMessageBody(options: AutoeditModelOptions): string {
        const maxTokens = getMaxOutputTokensForAutoedits(options.codeToRewrite)
        const body: FireworksCompatibleRequestParams = {
            stream: false,
            model: options.model,
            temperature: 0,
            max_tokens: maxTokens,
            response_format: {
                type: 'text',
            },
            prediction: {
                type: 'content',
                content: options.codeToRewrite,
            },
            rewrite_speculation: true,
            user: options.userId || undefined,
        }
        const request = options.isChatModel
            ? {
                  ...body,
                  messages: getOpenaiCompatibleChatPrompt({
                      systemMessage: options.prompt.systemMessage,
                      userMessage: options.prompt.userMessage,
                  }),
              }
            : { ...body, prompt: options.prompt.userMessage }
        return JSON.stringify(request)
    }
}
