import * as vscode from 'vscode'

import {
    type ContextItem,
    type Message,
    PromptMixin,
    PromptString,
    getSimplePreamble,
    isDefined,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { logDebug } from '../../log'
import { PromptBuilder } from '../../prompt-builder'
import type { ChatModel } from './ChatModel'

export interface PromptInfo {
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

export class DefaultPrompter {
    constructor(
        private explicitContext: ContextItem[],
        private corpusContext: ContextItem[],
        /**
         * Whether the current message is from a default command.
         * We will apply context assist prompt for non-command chat messages.
         */
        private isCommand = false
    ) {}
    // Constructs the raw prompt to send to the LLM, with message order reversed, so we can construct
    // an array with the most important messages (which appear most important first in the reverse-prompt.
    //
    // Returns the reverse prompt and the new context that was used in the prompt for the current message.
    // If user-context added at the last message is ignored, returns the items in the newContextIgnored array.
    public async makePrompt(chat: ChatModel, codyApiVersion: number): Promise<PromptInfo> {
        return wrapInActiveSpan('chat.prompter', async () => {
            const promptBuilder = await PromptBuilder.create(chat.contextWindow)
            const preInstruction: PromptString | undefined = PromptString.fromConfig(
                vscode.workspace.getConfiguration('cody.chat'),
                'preInstruction',
                undefined
            )

            // Add preamble messages
            const preambleMessages = getSimplePreamble(
                chat.modelID,
                codyApiVersion,
                'Chat',
                preInstruction
            )
            if (!promptBuilder.tryAddToPrefix(preambleMessages)) {
                throw new Error(`Preamble length exceeded context window ${chat.contextWindow.input}`)
            }

            // Add existing chat transcript messages
            const reverseTranscript = [...chat.getDehydratedMessages()].reverse()
            const historyItems = reverseTranscript
                .flatMap(m => (m.contextFiles ? [...m.contextFiles].reverse() : []))
                .filter(isDefined)

            // Apply the context preamble via the prompt mixin to the last open-ended human message that is not a command.
            // The context preamble provides additional instructions on how Cody should respond using the attached context items,
            // allowing Cody to provide more contextually relevant responses.
            //
            // Adding the preamble before the final build step ensures it is included in the final prompt but not displayed in the UI.
            // It also allows adding the preamble only when there is context to display, without wasting tokens on the same preamble repeatedly.
            if (
                !this.isCommand &&
                Boolean(this.explicitContext.length || historyItems.length || this.corpusContext.length)
            ) {
                reverseTranscript[0] = PromptMixin.mixInto(reverseTranscript[0], chat.modelID)
            }

            const messagesIgnored = promptBuilder.tryAddMessages(reverseTranscript)
            if (messagesIgnored) {
                logDebug(
                    'DefaultPrompter.makePrompt',
                    `Ignored ${messagesIgnored} chat messages due to context limit`
                )
            }
            // Counter for context items categorized by source
            const ignoredContext = { user: 0, corpus: 0, transcript: 0 }

            // Add context from new user-specified context items, e.g. @-mentions, active selection, etc.
            const newUserContext = await promptBuilder.tryAddContext('user', this.explicitContext)
            ignoredContext.user += newUserContext.ignored.length

            // Lists of context items added from the last human message.
            // NOTE: For UI display only, not used in the prompt.
            const context: PromptInfo['context'] = { used: [], ignored: [] }
            // List of valid context items added from the last human message
            context.used.push(...newUserContext.added.map(c => ({ ...c, isTooLarge: false })))
            // NOTE: Only used for display excluded context from user-specified context items in UI
            context.ignored.push(...newUserContext.ignored.map(c => ({ ...c, isTooLarge: true })))

            // Add corpus context
            if (this.corpusContext.length > 0) {
                const newCorpusContextMessages = await promptBuilder.tryAddContext(
                    'corpus',
                    this.corpusContext.slice()
                )
                // Because this corpus context is added for the last human message,
                // we will also add it to the context list for display.
                context.used.push(...newCorpusContextMessages.added)
                context.ignored.push(...newCorpusContextMessages.ignored)
                ignoredContext.corpus += newCorpusContextMessages.ignored.length
            }

            // If there's room left, add context from previous messages (both user-defined and corpus).
            const historyContext = await promptBuilder.tryAddContext('history', historyItems.reverse())
            ignoredContext.transcript += historyContext.ignored.length

            // Log only if there are any ignored context items.
            if (ignoredContext.user + ignoredContext.corpus + ignoredContext.transcript > 0) {
                logDebug(
                    'DefaultPrompter.makePrompt',
                    `Ignored context due to context limit: user=${ignoredContext.user}, corpus=${ignoredContext.corpus}, previous=${ignoredContext.transcript}`
                )
            }

            return {
                prompt: promptBuilder.build(),
                context,
            }
        })
    }
}
