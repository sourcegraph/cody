import {
    type ChatMessage,
    type ContextItem,
    type ContextTokenUsageType,
    type Message,
    type ModelContextWindow,
    TokenCounter,
    contextFiltersProvider,
    isCodyIgnoredFile,
    logDebug,
    ps,
} from '@sourcegraph/cody-shared'
import { sortContextItems } from '../chat/chat-view/agentContextSorting'
import { getUniqueContextItems, isUniqueContextItem } from './unique-context'
import { getContextItemTokenUsageType, renderContextItem } from './utils'

interface PromptBuilderContextResult {
    limitReached: boolean
    ignored: ContextItem[]
    added: ContextItem[]
}

export type PromptContextType = ContextTokenUsageType | 'history'

const ASSISTANT_MESSAGE = { speaker: 'assistant', text: ps`Ok.` } as Message
/**
 * PromptBuilder constructs a full prompt given a charLimit constraint.
 * The final prompt is constructed by concatenating the following fields:
 * - prefixMessages
 * - the reverse of reverseMessages
 */
export class PromptBuilder {
    private prefixMessages: Message[] = []
    private reverseMessages: Message[] = []

    /**
     * A list of context items that are used to build context messages.
     */
    public contextItems: ContextItem[] = []

    private tokenCounter: TokenCounter

    constructor(contextWindow: ModelContextWindow) {
        this.tokenCounter = new TokenCounter(contextWindow)
    }

    public build(): Message[] {
        for (const item of this.contextItems) {
            // Create context messages for each context item, where
            // assistant messages come first because the transcript is in reversed order.
            const contextMessage = renderContextItem(item)
            const messagePair = contextMessage && [ASSISTANT_MESSAGE, contextMessage]
            messagePair && this.reverseMessages.push(...messagePair)
        }

        return this.prefixMessages.concat([...this.reverseMessages].reverse())
    }

    public tryAddToPrefix(messages: Message[]): boolean {
        const withinLimit = this.tokenCounter.updateUsage('preamble', messages)
        if (withinLimit) {
            this.prefixMessages.push(...messages)
        }
        return withinLimit
    }

    /**
     * Tries to add messages in pairs from reversed transcript to the prompt builder.
     * Returns the index of the last message that was successfully added.
     *
     * Validates that the transcript alternates between human and assistant speakers.
     * Stops adding when the character limit would be exceeded.
     */
    public tryAddMessages(reverseTranscript: ChatMessage[]): number {
        // All Human message is expected to be followed by response from Assistant,
        // except for the Human message at the last index that Assistant hasn't responded yet.
        const lastHumanMsgIndex = reverseTranscript.findIndex(msg => msg.speaker === 'human')
        for (let i = lastHumanMsgIndex; i < reverseTranscript.length; i += 2) {
            const humanMsg = reverseTranscript[i]
            const assistantMsg = reverseTranscript[i - 1]
            if (humanMsg?.speaker !== 'human' || humanMsg?.speaker === assistantMsg?.speaker) {
                throw new Error(`Invalid transcript order: expected human message at index ${i}`)
            }
            const withinLimit = this.tokenCounter.updateUsage('input', [humanMsg, assistantMsg])
            if (!withinLimit) {
                return reverseTranscript.length - i + (assistantMsg ? 1 : 0)
            }
            if (assistantMsg) {
                this.reverseMessages.push(assistantMsg)
            }
            this.reverseMessages.push(humanMsg)
        }
        return 0
    }

    public async tryAddContext(
        type: PromptContextType,
        contextItems: ContextItem[]
    ): Promise<PromptBuilderContextResult> {
        // Turn-based context items that are used for UI display only.
        const result = {
            limitReached: false, // Indicates if the token budget was exceeded
            ignored: [] as ContextItem[], // The items that were ignored/excluded
            added: [] as ContextItem[], // The items that were added as context
        }

        // Create a new array to avoid modifying the original array,
        // then reverse it to process the newest context items first.
        const reversedContextItems = contextItems.slice().reverse()

        // Required by agent tests to ensure the context items are sorted correctly.
        sortContextItems(reversedContextItems as ContextItem[])

        for (const item of reversedContextItems) {
            // Skip context items that are in the Cody ignore list
            if (isCodyIgnoredFile(item.uri) || (await contextFiltersProvider.isUriIgnored(item.uri))) {
                result.ignored.push(item)
                continue
            }

            // Special-case remote context here. We can usually rely on the remote context to honor
            // any context filters but in case of client side overwrites, we want a file that is
            // ignored on a client to always be treated as ignored.
            if (
                item.type === 'file' &&
                (item.uri.scheme === 'https' || item.uri.scheme === 'http') &&
                item.repoName &&
                contextFiltersProvider.isRepoNameIgnored(item.repoName)
            ) {
                result.ignored.push(item)
                continue
            }

            const contextMessage = renderContextItem(item)
            if (!contextMessage) {
                continue
            }

            // Skip duplicated or invalid items before updating the token usage.
            if (!isUniqueContextItem(item, this.contextItems)) {
                continue
            }

            const tokenType = getContextItemTokenUsageType(item)
            const isWithinLimit = this.tokenCounter.updateUsage(tokenType, [
                ASSISTANT_MESSAGE,
                contextMessage,
            ])

            item.isTooLarge = !isWithinLimit

            // Skip item that would exceed token limit & add it to the ignored list.
            if (!isWithinLimit) {
                item.content = undefined
                result.ignored.push(item)
                result.limitReached = true
                continue
            }

            // Add the new valid context item to the context list.
            result.added.push(item) // for UI display.
            this.contextItems.push(item) // for building context messages.
            // Update context items for the next iteration, removes items that are no longer unique.
            // TODO (bee) update token usage to reflect the removed context items.
            this.contextItems = getUniqueContextItems(this.contextItems)
        }

        logDebug('tryAddContext', `${result.ignored.length} of ${type} context were excluded.`)

        result.added = this.contextItems.filter(c => result.added.includes(c))
        return result
    }
}
