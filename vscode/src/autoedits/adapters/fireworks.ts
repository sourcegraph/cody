import { autoeditsLogger } from '../logger'
import type { AutoeditsModelAdapter } from '../prompt-provider'
import { getModelResponse } from '../prompt-provider'
import type { AutoeditModelOptions } from '../prompt-provider'
import { getMaxOutputTokensForAutoedits, getOpenaiCompatibleChatPrompt } from './utils'

export class FireworksAdapter implements AutoeditsModelAdapter {
    async getModelResponse(option: AutoeditModelOptions): Promise<string> {
        const body = this.getMessageBody(option)
        try {
            const response = await getModelResponse(option.url, body, option.apiKey)
            if (option.isChatModel) {
                return response.choices[0].message.content
            }
            return response.choices[0].text
        } catch (error) {
            autoeditsLogger.logDebug('AutoEdits', 'Error calling Fireworks API:', error)
            throw error
        }
    }

    private getMessageBody(option: AutoeditModelOptions): string {
        const maxTokens = getMaxOutputTokensForAutoedits(option.codeToRewrite)
        const body: Record<string, any> = {
            model: option.model,
            temperature: 0.2,
            max_tokens: maxTokens,
            response_format: {
                type: 'text',
            },
            // Fireworks Predicted outputs
            // https://docs.fireworks.ai/guides/querying-text-models#predicted-outputs
            prediction: {
                type: 'content',
                content: option.codeToRewrite,
            },
            rewrite_speculation: true,
            user: option.userId,
        }
        if (option.isChatModel) {
            body.messages = getOpenaiCompatibleChatPrompt({
                systemMessage: option.prompt.systemMessage,
                userMessage: option.prompt.userMessage,
            })
        } else {
            body.prompt = option.prompt.userMessage
        }
        return JSON.stringify(body)
    }
}
