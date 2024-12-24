import { autoeditsLogger } from '../logger'
import type { AutoeditModelOptions, AutoeditsModelAdapter } from './base'
import { getModelResponse } from './utils'
import {
    type FireworksCompatibleRequestParams,
    getMaxOutputTokensForAutoedits,
    getOpenaiCompatibleChatPrompt,
} from './utils'

export class CodyGatewayAdapter implements AutoeditsModelAdapter {
    async getModelResponse(option: AutoeditModelOptions): Promise<string> {
        const headers = {
            'X-Sourcegraph-Feature': 'code_completions',
        }
        const body = this.getMessageBody(option)
        try {
            const response = await getModelResponse(option.url, body, option.apiKey, headers)
            if (option.isChatModel) {
                return response.choices[0].message.content
            }
            return response.choices[0].text
        } catch (error) {
            autoeditsLogger.logDebug('AutoEdits', 'Error calling Cody Gateway:', error)
            throw error
        }
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
