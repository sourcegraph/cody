import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsLogger } from '../logger'

import type { AutoeditModelOptions, AutoeditsModelAdapter } from './base'
import {
    type FireworksCompatibleRequestParams,
    getMaxOutputTokensForAutoedits,
    getModelResponse,
    getOpenaiCompatibleChatPrompt,
} from './utils'

export class FireworksAdapter implements AutoeditsModelAdapter {
    async getModelResponse(option: AutoeditModelOptions): Promise<string> {
        const body = this.getMessageBody(option)
        try {
            const apiKey = autoeditsProviderConfig.experimentalAutoeditsConfigOverride?.apiKey

            if (!apiKey) {
                autoeditsLogger.logError('Autoedits', 'No api key provided in the config override')
                throw new Error('No api key provided in the config override')
            }
            const response = await getModelResponse(option.url, body, apiKey)
            if (option.isChatModel) {
                return response.choices[0].message.content
            }
            return response.choices[0].text
        } catch (error) {
            autoeditsLogger.logDebug('AutoEdits', 'Error calling Fireworks API:', error)
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
            // Fireworks Predicted outputs
            // https://docs.fireworks.ai/guides/querying-text-models#predicted-outputs
            prediction: {
                type: 'content',
                content: options.codeToRewrite,
            },
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
