import {
    type ChatMessage,
    type ContextItem,
    type Message,
    type PromptString,
    isDefined,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { logDebug } from '../../output-channel-logger'
import { PromptBuilder } from '../../prompt-builder'
import type { ChatBuilder } from './ChatBuilder'

// A prompter that creates a prompt for an agentic chat model
export class AgenticChatPrompter {
    constructor(private readonly preamble: PromptString) {}
    public async makePrompt(chat: ChatBuilder, context: ContextItem[] = []): Promise<Message[]> {
        return wrapInActiveSpan('chat.prompter', async () => {
            const contextWindow = { input: 150000, output: 8000 }
            const promptBuilder = await PromptBuilder.create(contextWindow)

            // Add preamble messages
            const preambleMessages = { speaker: 'system', text: this.preamble } satisfies ChatMessage
            if (!promptBuilder.tryAddToPrefix([preambleMessages])) {
                throw new Error(`Preamble length exceeded context window ${contextWindow.input}`)
            }

            // Add existing chat transcript messages
            const reverseTranscript = [...chat.getDehydratedMessages()].reverse()
            logDebug('reverseTranscript', 'reverseTranscript', { verbose: reverseTranscript })

            promptBuilder.tryAddMessages(reverseTranscript)

            if (context.length > 0) {
                await promptBuilder.tryAddContext('user', context)
            }

            const historyItems = reverseTranscript
                .flatMap(m => (m.contextFiles ? [...m.contextFiles].reverse() : []))
                .filter(isDefined)

            await promptBuilder.tryAddContext('history', historyItems.reverse())

            return promptBuilder.build()
        })
    }
}
