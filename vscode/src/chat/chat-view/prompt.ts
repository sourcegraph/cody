import * as vscode from 'vscode'

import {
    type ChatMessage,
    type ContextItem,
    type ContextItemWithContent,
    type Message,
    PromptString,
    getSimplePreamble,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

import { logDebug } from '../../log'

import { PromptBuilder } from '../../prompt-builder'
import type { SimpleChatModel } from './SimpleChatModel'
import { sortContextItems } from './agentContextSorting'

interface PromptInfo {
    prompt: Message[]
    newContextUsed: ContextItem[]
    newContextIgnored?: ContextItem[]
}

export interface IPrompter {
    makePrompt(chat: SimpleChatModel, codyApiVersion: number): Promise<PromptInfo>
}

export class DefaultPrompter implements IPrompter {
    constructor(
        private explicitContext: ContextItemWithContent[],
        private getEnhancedContext?: (query: PromptString) => Promise<ContextItem[]>
    ) {}
    // Constructs the raw prompt to send to the LLM, with message order reversed, so we can construct
    // an array with the most important messages (which appear most important first in the reverse-prompt.
    //
    // Returns the reverse prompt and the new context that was used in the prompt for the current message.
    // If user-context added at the last message is ignored, returns the items in the newContextIgnored array.
    public async makePrompt(
        chat: SimpleChatModel,
        codyApiVersion: number
    ): Promise<{
        prompt: Message[]
        newContextUsed: ContextItem[]
        newContextIgnored?: ContextItem[]
    }> {
        return wrapInActiveSpan('chat.prompter', async () => {
            const promptBuilder = new PromptBuilder(chat.contextWindow)
            const preInstruction: PromptString | undefined = PromptString.fromConfig(
                vscode.workspace.getConfiguration('cody.chat'),
                'preInstruction',
                undefined
            )

            const preambleMessages = getSimplePreamble(chat.modelID, codyApiVersion, preInstruction)
            const preambleSucceeded = promptBuilder.tryAddToPrefix(preambleMessages)
            if (!preambleSucceeded) {
                throw new Error(
                    `Preamble length exceeded context window size ${chat.contextWindow.input}`
                )
            }

            // Add existing chat transcript messages
            const reverseTranscript: ChatMessage[] = [...chat.getMessages()].reverse()
            const transcriptLimitReached = promptBuilder.tryAddMessages(reverseTranscript)
            if (transcriptLimitReached) {
                logDebug(
                    'DefaultPrompter.makePrompt',
                    `Ignored ${transcriptLimitReached} transcript messages due to context limit`
                )
            }

            // NOTE: Only display excluded context from user-specifed context items
            const newContextIgnored: ContextItem[] = []
            const newContextUsed: ContextItem[] = []

            // Add context from new user-specified context items, e.g. @-mentions, @-uri
            sortContextItems(this.explicitContext)
            const {
                limitReached: userLimitReached,
                used,
                ignored,
            } = promptBuilder.tryAddContext('user', this.explicitContext)
            newContextUsed.push(...used)
            newContextIgnored.push(...ignored)
            if (userLimitReached) {
                logDebug(
                    'DefaultPrompter.makePrompt',
                    'Ignored current user-specified context items due to context limit'
                )
                return { prompt: promptBuilder.build(), newContextUsed, newContextIgnored }
            }

            // Add user and enhanced context from previous messages seperately as they have different budgets
            const prevContext = reverseTranscript.flatMap(m => m?.contextFiles || [])
            const userContext = prevContext.filter(c => c.source === 'user')
            if (promptBuilder.tryAddContext('user', userContext).limitReached) {
                logDebug('DefaultPrompter.makePrompt', 'Ignored prior user context due to limit')
                return { prompt: promptBuilder.build(), newContextUsed, newContextIgnored }
            }
            const enhancedContext = prevContext.filter(c => c.source !== 'user')
            if (promptBuilder.tryAddContext('enhanced', enhancedContext).limitReached) {
                logDebug('DefaultPrompter.makePrompt', 'Ignored prior enhanced context due to limit')
                return { prompt: promptBuilder.build(), newContextUsed, newContextIgnored }
            }

            // Add additional context from current editor or broader search when enhanced context is enabled
            if (this.getEnhancedContext) {
                const lastMessage = reverseTranscript[0]
                if (!lastMessage?.text) {
                    throw new Error('No last message or last message text was empty')
                }
                if (lastMessage.speaker === 'assistant') {
                    throw new Error('Last message in prompt needs speaker "human", but was "assistant"')
                }
                const newEnhancedContext = await this.getEnhancedContext(lastMessage.text)
                sortContextItems(newEnhancedContext)
                const { limitReached, used, ignored } = promptBuilder.tryAddContext(
                    'enhanced',
                    newEnhancedContext
                )
                newContextUsed.push(...used)
                if (limitReached) {
                    logDebug(
                        'DefaultPrompter.makePrompt',
                        `Ignored ${ignored.length} additional enhanced context due to limit reached`
                    )
                }
            }

            return { prompt: promptBuilder.build(), newContextUsed, newContextIgnored }
        })
    }
}
