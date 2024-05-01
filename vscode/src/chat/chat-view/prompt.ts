import {
    type ChatMessage,
    type ContextItem,
    type ContextItemWithContent,
    type Message,
    PromptString,
    getSimplePreamble,
    isDefined,
    ps,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import _ from 'lodash'
import * as vscode from 'vscode'

import { logDebug } from '../../log'

import { PromptBuilder } from '../../prompt-builder'
import type { SimpleChatModel } from './SimpleChatModel'
import { sortContextItems } from './agentContextSorting'

interface PromptInfo {
    prompt: Message[]
    newContextUsed: ContextItem[]
    newContextIgnored: ContextItem[]
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
        newContextIgnored: ContextItem[]
    }> {
        return wrapInActiveSpan('chat.prompter', async () => {
            const promptBuilder = new PromptBuilder(chat.contextWindow)
            const preInstruction: PromptString | undefined = PromptString.fromConfig(
                vscode.workspace.getConfiguration('cody.chat'),
                'preInstruction',
                undefined
            )

            sortContextItems(this.explicitContext)
            // We now filter out any mixins from the user contet and add those as preamble messages as well
            const [preambleMixins, filteredExplicitContext] = _.partition(
                this.explicitContext,
                i => i.type === 'mixin' && i.injectAt === 'preamble'
            )
            //TODO(rnauta): handle injectAt: mentions

            const preambleMixinStrings = preambleMixins
                .map(mixin => {
                    return PromptString.fromContextItem(mixin).content
                })
                .filter(isDefined)
            const preInstructionWithMixins = PromptString.join(
                [...(preInstruction ? [preInstruction] : []), ...preambleMixinStrings],
                ps`\n\n`
            )

            const preambleMessages = getSimplePreamble(
                chat.modelID,
                codyApiVersion,
                preInstructionWithMixins
            )
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
            const {
                limitReached: userLimitReached,
                used,
                ignored,
            } = promptBuilder.tryAddContext('user', filteredExplicitContext)
            newContextUsed.push(...used.map(c => ({ ...c, isTooLarge: false })))
            newContextIgnored.push(...ignored.map(c => ({ ...c, isTooLarge: true })))
            if (userLimitReached) {
                logDebug(
                    'DefaultPrompter.makePrompt',
                    'Ignored current user-specified context items due to context limit'
                )
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
