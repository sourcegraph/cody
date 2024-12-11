import { autoeditsLogger } from '../logger'
import type { AutoeditModelOptions, AutoeditsModelAdapter } from './base'
import { getModelResponse, getOpenaiCompatibleChatPrompt } from './utils'

export class OpenAIAdapter implements AutoeditsModelAdapter {
    async getModelResponse(option: AutoeditModelOptions): Promise<string> {
        try {
            const response = await getModelResponse(
                option.url,
                JSON.stringify({
                    model: option.model,
                    messages: getOpenaiCompatibleChatPrompt({
                        systemMessage: option.prompt.systemMessage,
                        userMessage: option.prompt.userMessage,
                    }),
                    temperature: 0.5,
                    max_tokens: 256,
                    response_format: {
                        type: 'text',
                    },
                }),
                option.apiKey
            )
            return response.choices[0].message.content
        } catch (error) {
            autoeditsLogger.logDebug('AutoEdits', 'Error calling OpenAI API:', error)
            throw error
        }
    }
}
