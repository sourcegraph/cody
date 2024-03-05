import * as vscode from 'vscode'

import {
    type ContextItem,
    type Message,
    getSimplePreamble,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

import { logDebug } from '../../log'

import { PromptBuilder } from '../../prompt-builder'
import type { MessageWithContext, SimpleChatModel } from './SimpleChatModel'
import { sortContextItems } from './agentContextSorting'

interface PromptInfo {
    prompt: Message[]
    newContextUsed: ContextItem[]
}

export interface IPrompter {
    makePrompt(chat: SimpleChatModel, charLimit: number): Promise<PromptInfo>
}

const ENHANCED_CONTEXT_ALLOCATION = 0.6 // Enhanced context should take up 60% of the context window

export class DefaultPrompter implements IPrompter {
    constructor(
        private explicitContext: ContextItem[],
        private getEnhancedContext?: (query: string, charLimit: number) => Promise<ContextItem[]>
    ) {}
    // Constructs the raw prompt to send to the LLM, with message order reversed, so we can construct
    // an array with the most important messages (which appear most important first in the reverse-prompt.
    //
    // Returns the reverse prompt and the new context that was used in the
    // prompt for the current message.
    public async makePrompt(
        chat: SimpleChatModel,
        charLimit: number
    ): Promise<{
        prompt: Message[]
        newContextUsed: ContextItem[]
    }> {
        return wrapInActiveSpan('chat.prompter', async () => {
            const enhancedContextCharLimit = Math.floor(charLimit * ENHANCED_CONTEXT_ALLOCATION)
            const promptBuilder = new PromptBuilder(charLimit)
            const newContextUsed: ContextItem[] = []
            const preInstruction: string | undefined = vscode.workspace
                .getConfiguration('cody.chat')
                .get('preInstruction')

            const preambleMessages = getSimplePreamble(preInstruction)
            const preambleSucceeded = promptBuilder.tryAddToPrefix(preambleMessages)
            if (!preambleSucceeded) {
                throw new Error(`Preamble length exceeded context window size ${charLimit}`)
            }

            // Add existing transcript messages
            const reverseTranscript: MessageWithContext[] = [...chat.getMessagesWithContext()].reverse()
            const contextLimitReached = promptBuilder.tryAddMessages(reverseTranscript)
            if (contextLimitReached) {
                logDebug(
                    'DefaultPrompter.makePrompt',
                    `Ignored ${contextLimitReached} transcript messages due to context limit`
                )
                return {
                    prompt: promptBuilder.build(),
                    newContextUsed,
                }
            }

            {
                // Add context from new user-specified context items
                const { limitReached, used } = promptBuilder.tryAddContext(this.explicitContext)
                newContextUsed.push(...used)
                if (limitReached) {
                    logDebug(
                        'DefaultPrompter.makePrompt',
                        'Ignored current user-specified context items due to context limit'
                    )
                    return { prompt: promptBuilder.build(), newContextUsed }
                }
            }

            // TODO(beyang): Decide whether context from previous messages is less
            // important than user added context, and if so, reorder this.
            {
                // Add context from previous messages
                const { limitReached } = promptBuilder.tryAddContext(
                    reverseTranscript.flatMap(
                        (message: MessageWithContext) => message.newContextUsed || []
                    )
                )
                if (limitReached) {
                    logDebug(
                        'DefaultPrompter.makePrompt',
                        'Ignored prior context items due to context limit'
                    )
                    return { prompt: promptBuilder.build(), newContextUsed }
                }
            }

            const lastMessage = reverseTranscript[0]
            if (!lastMessage?.message.text) {
                throw new Error('No last message or last message text was empty')
            }
            if (lastMessage.message.speaker === 'assistant') {
                throw new Error('Last message in prompt needs speaker "human", but was "assistant"')
            }
            if (this.getEnhancedContext) {
                // Add additional context from current editor or broader search
                const additionalContextItems = await this.getEnhancedContext(
                    lastMessage.message.text,
                    enhancedContextCharLimit
                )
                sortContextItems(additionalContextItems)
                const { limitReached, used, ignored } = promptBuilder.tryAddContext(
                    additionalContextItems,
                    enhancedContextCharLimit
                )
                newContextUsed.push(...used)
                if (limitReached) {
                    logDebug(
                        'DefaultPrompter.makePrompt',
                        `Ignored ${ignored.length} additional context items due to limit reached`
                    )
                }
            }

            return {
                prompt: promptBuilder.build(),
                newContextUsed,
            }
        })
    }
}
