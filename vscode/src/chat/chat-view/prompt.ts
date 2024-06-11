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
import { PromptMixin } from '@sourcegraph/cody-shared/src/prompt/prompt-mixin'
import { PromptBuilder, type PromptContextType } from '../../prompt-builder'
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
        excluded: ContextItem[]
    }
}

export class DefaultPrompter {
    constructor(
        private explicitContext: ContextItemWithContent[],
        private getEnhancedContext?: (query: PromptString) => Promise<ContextItem[]>,
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
                throw new Error(`Preamble length exceeded context window ${chat.contextWindow.input}`)
            }

            // Reverse chat transcript messages.
            const reverseTranscript = [...chat.getDehydratedMessages()].reverse()

            // Context from previous messages (both user-defined and enhanced).
            const historyItems = reverseTranscript.flatMap(m => m?.contextFiles).filter(isDefined)

            // Apply the context preamble via the prompt mixin to the last open-ended human message that is not a command.
            // The context preamble provides additional instructions on how Cody should respond using the attached context items,
            // allowing Cody to provide more contextually relevant responses.
            //
            // Adding the preamble before the final build step ensures it is included in the final prompt but not displayed in the UI.
            // It also allows adding the preamble only when there is context to display, without wasting tokens on the same preamble repeatedly.
            if (
                !this.isCommand &&
                Boolean(this.explicitContext.length || historyItems.length || this.getEnhancedContext)
            ) {
                reverseTranscript[0] = PromptMixin.mixInto(reverseTranscript[0])
            }

            // Add existing chat transcript messages.
            promptBuilder.tryAddMessages(reverseTranscript)

            // Context items that were added/excluded in the final prompt.
            // Excluded items are items that were ignored due to context limit or context filter (cody ignored).
            const context: PromptInfo['context'] = { used: [], excluded: [] }
            async function tryAddContext(type: PromptContextType, items: ContextItem[]): Promise<void> {
                const processed = await promptBuilder.tryAddContext(type, items)
                context.used.push(...processed.added)
                context.excluded.push(...processed.ignored)
            }

            // Add new user-specified context, e.g. @-mentions, active selection, etc.
            await tryAddContext('user', this.explicitContext)

            // Add auto context
            if (this.getEnhancedContext) {
                const lastMessage = reverseTranscript[0]
                if (!lastMessage?.text || lastMessage.speaker !== 'human') {
                    throw new Error('Last message in prompt needs speaker "human", but was "assistant"')
                }

                const autoContext = await this.getEnhancedContext(lastMessage.text)
                await tryAddContext('enhanced', autoContext)
            }

            // Reverse the history items to add the most recent items first.
            await tryAddContext('history', historyItems.reverse())

            // Remove content before sending the list to the webview.
            context.used.map(c => ({ ...c, content: undefined }))
            context.excluded.map(c => ({ ...c, content: undefined }))

            return {
                prompt: promptBuilder.build(),
                context,
            }
        })
    }
}
