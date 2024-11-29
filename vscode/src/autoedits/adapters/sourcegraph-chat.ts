import type { ChatClient, Message } from '@sourcegraph/cody-shared'
import { autoeditsLogger } from '../logger'
import type { AutoeditsModelAdapter, ChatPrompt } from '../prompt-provider'
import type { AutoeditModelOptions } from '../prompt-provider'

export class SourcegraphChatAdapter implements AutoeditsModelAdapter {
    constructor(private readonly chatClient: ChatClient) {}

    async getModelResponse(option: AutoeditModelOptions): Promise<string> {
        try {
            const messages = this.convertChatPromptToMessage(option.prompt)
            const stream = await this.chatClient.chat(
                messages,
                {
                    model: option.model,
                    maxTokensToSample: 256,
                    temperature: 0.2,
                },
                new AbortController().signal
            )

            let accumulated = ''
            for await (const msg of stream) {
                if (msg.type === 'change') {
                    const newText = msg.text.slice(accumulated.length)
                    accumulated += newText
                } else if (msg.type === 'complete' || msg.type === 'error') {
                    break
                }
            }
            return accumulated
        } catch (error) {
            autoeditsLogger.logDebug('AutoEdits', 'Error calling Cody Gateway:', error)
            throw error
        }
    }

    private convertChatPromptToMessage(prompt: ChatPrompt): Message[] {
        return prompt.map(p => ({
            speaker: this.getSpeaker(p.role) as 'system' | 'assistant' | 'human',
            text: p.content,
        }))
    }

    private getSpeaker(role: string): string {
        return role === 'user' ? 'human' : role
    }
}
