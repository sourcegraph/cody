import type { CodeCompletionsClient, Message } from '@sourcegraph/cody-shared'
import { defaultCodeCompletionsClient } from '../../completions/default-client'
import { autoeditsLogger } from '../logger'
import type { AutoeditsModelAdapter } from '../prompt-provider'
import type { AutoeditModelOptions } from '../prompt-provider'

export class SourcegraphCompletionsAdapter implements AutoeditsModelAdapter {
    private client: CodeCompletionsClient

    constructor() {
        this.client = defaultCodeCompletionsClient.instance!
    }

    async getModelResponse(option: AutoeditModelOptions): Promise<string> {
        try {
            const messages: Message[] = [
                {
                    speaker: 'human',
                    text: option.prompt.userMessage,
                },
            ]
            const requestParam = {
                timeoutMs: 1_000,
                messages,
                maxTokensToSample: 256,
                temperature: 0.2,
            }
            const stream = await this.client.complete(requestParam, new AbortController())

            let accumulated = ''
            for await (const msg of stream) {
                const newText = msg.completionResponse?.completion
                if (newText) {
                    accumulated += newText
                }
            }
            return accumulated
        } catch (error) {
            autoeditsLogger.logDebug('AutoEdits', 'Error calling Sourcegraph Completions:', error)
            throw error
        }
    }
}
