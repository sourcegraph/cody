import { autoeditsLogger } from '../logger'
import type { AutoeditsModelAdapter } from '../prompt-provider'
import { getModelResponse } from '../prompt-provider'
import type { AutoeditModelOptions } from '../prompt-provider'
import { getMaxOutputTokensForAutoedits, getOpenaiCompatibleChatPrompt } from './utils'

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

    private getMessageBody(option: AutoeditModelOptions): string {
        const maxTokens = getMaxOutputTokensForAutoedits(option.codeToRewrite)
        const body: Record<string, any> = {
            stream: false,
            model: option.model,
            temperature: 0.2,
            max_tokens: maxTokens,
            response_format: {
                type: 'text',
            },
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
