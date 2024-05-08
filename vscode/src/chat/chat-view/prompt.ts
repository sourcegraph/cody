import * as vscode from 'vscode'

import {
    type ContextItem,
    type ContextItemWithContent,
    type Message,
    PromptString,
    getSimplePreamble,
    isDefined,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

import { logDebug } from '../../log'

import { PromptBuilder } from '../../prompt-builder'
import type { SimpleChatModel } from './SimpleChatModel'

interface PromptInfo {
    prompt: Message[]
    /**
     * The context items processed for the current message:
     * - used: Context items that were used in the prompt.
     * - ignored: Context items that were ignored due to context limit or cody ignored.
     */
    context: {
        used: ContextItem[]
        ignored: ContextItem[]
    }
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
    public async makePrompt(chat: SimpleChatModel, codyApiVersion: number): Promise<PromptInfo> {
        return wrapInActiveSpan('chat.prompter', async () => {
            const promptBuilder = new PromptBuilder(chat.contextWindow)
            const preInstruction: PromptString | undefined = PromptString.fromConfig(
                vscode.workspace.getConfiguration('cody.chat'),
                'preInstruction',
                undefined
            )

            // Add preamble messages
            const preambleMessages = getSimplePreamble(chat.modelID, codyApiVersion, preInstruction)
            if (!promptBuilder.tryAddToPrefix(preambleMessages)) {
                throw new Error(
                    `Preamble length exceeded context window size ${chat.contextWindow.input}`
                )
            }

            // Add existing chat transcript messages
            const reverseTranscript = [...chat.getMessages()].reverse()
            const transcriptLimitReached = promptBuilder.tryAddMessages(reverseTranscript)
            if (transcriptLimitReached) {
                logDebug(
                    'DefaultPrompter.makePrompt',
                    `Ignored ${transcriptLimitReached} chat messages due to context limit`
                )
            }

            // Counter for context items categorized by source
            const ignoredContext = { user: 0, enhanced: 0, transcript: 0 }

            // Add context from new user-specified context items, e.g. @-mentions, @-uri
            const newUserContext = await promptBuilder.tryAddContext('user', this.explicitContext)
            ignoredContext.user += newUserContext.ignored.length

            // Lists of context items added from the last human message.
            // NOTE: For UI display only, not used in the prompt.
            const context = { used: [] as ContextItem[], ignored: [] as ContextItem[] }
            // List of valid context items added from the last human message
            context.used.push(...newUserContext.added.map(c => ({ ...c, isTooLarge: false })))
            // NOTE: Only used for display excluded context from user-specifed context items in UI
            context.ignored.push(...newUserContext.ignored.map(c => ({ ...c, isTooLarge: true })))

            // Add user and enhanced context from previous messages (chat transcript)
            const historyItems = reverseTranscript.flatMap(m => m?.contextFiles).filter(isDefined)
            const historyContext = await promptBuilder.tryAddContext('history', historyItems.reverse())
            ignoredContext.transcript += historyContext.ignored.length

            // Get new enhanced context from current editor or broader search when enabled
            if (this.getEnhancedContext) {
                const lastMessage = reverseTranscript[0]
                if (!lastMessage?.text || lastMessage.speaker !== 'human') {
                    throw new Error('Last message in prompt needs speaker "human", but was "assistant"')
                }

                const newEnhancedContextItems = await this.getEnhancedContext(lastMessage.text)
                const newEnhancedMessages = await promptBuilder.tryAddContext(
                    'enhanced',
                    newEnhancedContextItems
                )
                // Because this enhanced context is added for the last human message,
                // we will also add it to the context list for display.
                context.used.push(...newEnhancedMessages.added)
                ignoredContext.enhanced += newEnhancedMessages.ignored.length
            }

            logDebug(
                'DefaultPrompter.makePrompt',
                `Ignored context due to context limit: user=${ignoredContext.user}, enhanced=${ignoredContext.enhanced}, previous=${ignoredContext.transcript}`
            )

            return {
                prompt: promptBuilder.build(),
                context,
            }
        })
    }
}
