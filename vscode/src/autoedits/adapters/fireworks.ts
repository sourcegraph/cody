import { autoeditsLogger } from '../logger'
import type { AutoeditsModelAdapter } from '../prompt-provider'
import { getModelResponse } from '../prompt-provider'
import type { AutoeditModelOptions } from '../prompt-provider'

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
        const body: Record<string, any> = {
            model: option.model,
            temperature: 0.2,
            max_tokens: 256,
            response_format: {
                type: 'text',
            },
            speculation: option.codeToRewrite,
            user: option.userId,
        }
        if (option.isChatModel) {
            body.messages = [
                {
                    role: 'system',
                    content: option.prompt.systemMessage,
                },
                {
                    role: 'user',
                    content: option.prompt.userMessage,
                },
            ]
        } else {
            body.prompt = `${option.prompt.systemMessage}\n\nUser: ${option.prompt.userMessage}`
        }
        return JSON.stringify(body)
    }
}
