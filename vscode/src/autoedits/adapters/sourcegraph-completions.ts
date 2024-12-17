import type {
    CodeCompletionsClient,
    CodeCompletionsParams,
    Message,
    ModelRefStr,
} from '@sourcegraph/cody-shared'
import { defaultCodeCompletionsClient } from '../../completions/default-client'
import { autoeditsLogger } from '../logger'
import type { AutoeditModelOptions, AutoeditsModelAdapter } from './base'
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
                temperature: 0,
                prediction: {
                    type: 'content',
                    content: option.codeToRewrite,
                },
            }
            const completionResponseGenerator = await this.client.complete(
                requestParam,
                new AbortController()
            )

            let accumulated = ''
            for await (const msg of completionResponseGenerator) {
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
