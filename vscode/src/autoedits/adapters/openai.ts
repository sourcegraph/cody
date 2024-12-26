import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsLogger } from '../logger'

import type { AutoeditModelOptions, AutoeditsModelAdapter } from './base'
import { getModelResponse, getOpenaiCompatibleChatPrompt } from './utils'

export class OpenAIAdapter implements AutoeditsModelAdapter {
    async getModelResponse(options: AutoeditModelOptions): Promise<string> {
        try {
            const apiKey = autoeditsProviderConfig.experimentalAutoeditsConfigOverride?.apiKey

            if (!apiKey) {
                autoeditsLogger.logError('Autoedits', 'No api key provided in the config override')
                throw new Error('No api key provided in the config override')
            }

            const response = await getModelResponse(
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
            return response.choices[0].message.content
        } catch (error) {
            autoeditsLogger.logDebug('AutoEdits', 'Error calling OpenAI API:', error)
            throw error
        }
    }
}
