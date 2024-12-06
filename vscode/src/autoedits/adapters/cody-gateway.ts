import { autoeditsLogger } from '../logger'
import type { AutoeditsModelAdapter } from '../prompt-provider'
import { getModelResponse } from '../prompt-provider'
import type { AutoeditModelOptions } from '../prompt-provider'

export class CodyGatewayAdapter implements AutoeditsModelAdapter {
    async getModelResponse(option: AutoeditModelOptions): Promise<string> {
        try {
            const headers = {
                'X-Sourcegraph-Feature': 'code_completions',
            }
            const body = {
                stream: false,
                model: option.model,
                messages: option.prompt,
                temperature: 0.2,
                max_tokens: 256,
                response_format: {
                    type: 'text',
                },
                speculation: option.codeToRewrite,
                user: option.userId,
            }
            const response = await getModelResponse(
                option.url,
                JSON.stringify(body),
                option.apiKey,
                headers
            )
            return response.choices[0].message.content
        } catch (error) {
            autoeditsLogger.logDebug('AutoEdits', 'Error calling Cody Gateway:', error)
            throw error
        }
    }
}
