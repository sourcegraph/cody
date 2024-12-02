import { autoeditsLogger } from '../logger'
import type { AutoeditsModelAdapter } from '../prompt-provider'
import { getModelResponse } from '../prompt-provider'
import type { AutoeditModelOptions } from '../prompt-provider'

export class FireworksAdapter implements AutoeditsModelAdapter {
    async getModelResponse(option: AutoeditModelOptions): Promise<string> {
        try {
            const response = await getModelResponse(
                option.url,
                JSON.stringify({
                    model: option.model,
                    messages: option.prompt,
                    temperature: 0.2,
                    max_tokens: 256,
                    response_format: {
                        type: 'text',
                    },
                    speculation: option.codeToRewrite,
                    user: option.userId,
                }),
                option.apiKey
            )
            return response.choices[0].message.content
        } catch (error) {
            autoeditsLogger.logDebug('AutoEdits', 'Error calling Fireworks API:', error)
            throw error
        }
    }
}
