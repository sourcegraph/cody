import type { CodeCompletionsClient, Message } from '@sourcegraph/cody-shared'
import type { CodeCompletionsParams } from '../../../../lib/shared/src/inferenceClient/misc'
import type { ModelRefStr } from '../../../../lib/shared/src/models/modelsService'
import { defaultCodeCompletionsClient } from '../../completions/default-client'
import { autoeditsLogger } from '../logger'
import type { AutoeditsModelAdapter } from '../prompt-provider'
import type { AutoeditModelOptions } from '../prompt-provider'
import { getMaxOutputTokensForAutoedits, getSourcegraphCompatibleChatPrompt } from './utils'

export class SourcegraphCompletionsAdapter implements AutoeditsModelAdapter {
    private client: CodeCompletionsClient

    constructor() {
        this.client = defaultCodeCompletionsClient.instance!
    }

    async getModelResponse(option: AutoeditModelOptions): Promise<string> {
        try {
            const maxTokens = getMaxOutputTokensForAutoedits(option.codeToRewrite)
            const messages: Message[] = getSourcegraphCompatibleChatPrompt({
                systemMessage: undefined,
                userMessage: option.prompt.userMessage,
            })
            const requestParam: CodeCompletionsParams = {
                timeoutMs: 5_000,
                model: option.model as ModelRefStr,
                messages,
                maxTokensToSample: maxTokens,
                temperature: 0.2,
                prediction: {
                    type: 'content',
                    content: option.codeToRewrite,
                },
            }
            const stream = await this.client.complete(requestParam, new AbortController())

            let accumulated = ''
            for await (const msg of stream) {
                const newText = msg.completionResponse?.completion
                if (newText) {
                    accumulated = newText
                }
            }
            return accumulated
        } catch (error) {
            autoeditsLogger.logDebug('AutoEdits', 'Error calling Sourcegraph Completions:', error)
            throw error
        }
    }
}
