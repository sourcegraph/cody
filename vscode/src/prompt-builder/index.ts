import {
    type ChatMessage,
    type ContextItem,
    FeatureFlag,
    type Message,
    type ModelContextWindow,
    PromptString,
    TokenCounter,
    contextFiltersProvider,
    featureFlagProvider,
    ps,
    storeLastValue,
} from '@sourcegraph/cody-shared'
import type { ContextTokenUsageType } from '@sourcegraph/cody-shared/src/token'
import { sortContextItemsIfInTest } from '../chat/chat-view/agentContextSorting'
import { logFirstEnrollmentEvent } from '../services/utils/enrollment-event'
import { getUniqueContextItems, isUniqueContextItem } from './unique-context'
import { getContextItemTokenUsageType, renderContextItem } from './utils'

interface PromptBuilderContextResult {
    limitReached: boolean
    ignored: ContextItem[]
    added: ContextItem[]
}

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

    /**
     * Convenience constructor because loading the tokenizer is async due to its large size.
     */
    public static async create(contextWindow: ModelContextWindow): Promise<PromptBuilder> {
        return new PromptBuilder(await TokenCounter.create(contextWindow))
    }

    private constructor(private readonly tokenCounter: TokenCounter) {}

    private _isCacheEnabled: boolean | undefined
    private get isCacheEnabled(): boolean {
        if (this._isCacheEnabled === undefined) {
            this._isCacheEnabled = logFirstEnrollmentEvent(
                FeatureFlag.CodyPromptCachingOnMessages,
                !!storeLastValue(
                    featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyPromptCachingOnMessages)
                ).value
            )
        }
        return this._isCacheEnabled
    }

    public build(): Message[] {
        if (this.contextItems.length > 0) {
            this.buildContextMessages()
        }

        return this.prefixMessages.concat([...this.reverseMessages].reverse())
    }

    /**
     * Create context messages for each context item, where
     * assistant messages come first because the transcript is in reversed order.
     */
    private buildContextMessages(): void {
        const mediaItems = this.contextItems.filter(i => i.type === 'media')
        for (const media of mediaItems) {
            const contextMessage = renderContextItem(media)
            if (contextMessage?.content?.length) {
                if (!this.reverseMessages[0]?.content?.length) {
                    this.reverseMessages[0].content = []
                }
                this.reverseMessages[0].content.push(...contextMessage.content)
            }
        }
        // Resolve non-media context items with cache enabled
        const nonMediaItems = this.contextItems.filter(i => i.type !== 'media')
        if (this.isCacheEnabled) {
            const messages = []
            for (const item of nonMediaItems) {
                const contextMessage = renderContextItem(item)
                if (contextMessage) {
                    messages.push(contextMessage)
                }
            }
            // Group all context messages
            const groupedText = PromptString.join(
                messages.map(m => m.text),
                ps`\n\n`
            )
            const groupedContextMessage = {
                speaker: 'human',
                text: groupedText,
                cacheEnabled: true,
            } as Message
            const messagePair = [ASSISTANT_MESSAGE, groupedContextMessage]
            messagePair && this.reverseMessages.push(...messagePair)
            return
        }
        for (const item of nonMediaItems) {
            // Create context messages for each context item, where
            // assistant messages come first because the transcript is in reversed order.
            const contextMessage = renderContextItem(item)
            const messagePair = contextMessage && [ASSISTANT_MESSAGE, contextMessage]
            messagePair && this.reverseMessages.push(...messagePair)
        }
    }

    public tryAddToPrefix(messages: Message[]): boolean {
        const { succeeded: withinLimit } = this.tokenCounter.updateUsage('preamble', messages)
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
    public tryAddMessages(reverseTranscript: ChatMessage[]): number | undefined {
        // All Human message is expected to be followed by response from Assistant,
        // except for the Human message at the last index that Assistant hasn't responded yet.
        const lastHumanMsgIndex = reverseTranscript.findIndex(msg => msg.speaker === 'human')
        for (let i = lastHumanMsgIndex; i < reverseTranscript.length; i += 2) {
            const humanMsg = reverseTranscript[i]
            const assistantMsg = reverseTranscript[i - 1]
            if (humanMsg?.speaker !== 'human' || humanMsg?.speaker === assistantMsg?.speaker) {
                throw new Error(`Invalid transcript order: expected human message at index ${i}`)
            }
            const { succeeded: withinLimit } = this.tokenCounter.updateUsage('input', [
                humanMsg,
                assistantMsg,
            ])
            if (!withinLimit) {
                // Throw error if the limit was exceeded and no message was added.
                if (!this.reverseMessages.length) {
                    throw new Error(
                        'The chat input has exceeded the token limit. If you are copying and pasting a file into the chat, try using the @-mention feature to attach the file instead.'
                    )
                }
                return reverseTranscript.length - i + (assistantMsg ? 1 : 0)
            }
            if (assistantMsg) {
                this.reverseMessages.push(assistantMsg)
            }
            this.reverseMessages.push(humanMsg)
        }
        // All messages were added successfully.
        return undefined
    }

    public async tryAddContext(
        type: ContextTokenUsageType | 'history',
        contextItems: ContextItem[]
    ): Promise<PromptBuilderContextResult> {
        // Turn-based context items that are used for UI display only.
        const result = {
            limitReached: false, // Indicates if the token budget was exceeded
            ignored: [] as ContextItem[], // The items that were ignored
            added: [] as ContextItem[], // The items that were added as context
        }

        // Required by agent tests to ensure the context items are sorted correctly.
        contextItems = sortContextItemsIfInTest(contextItems)

        for (const item of contextItems) {
            // Skip context items that are in the Cody ignore list
            if (await contextFiltersProvider.isUriIgnored(item.uri)) {
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
                (await contextFiltersProvider.isRepoNameIgnored(item.repoName))
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
            const { succeeded: isWithinLimit, reason } = this.tokenCounter.updateUsage(tokenType, [
                ASSISTANT_MESSAGE,
                contextMessage,
            ])

            // Don't update context items from the past (history items) unless undefined.
            if (type !== 'history' || item.isTooLarge === undefined) {
                item.isTooLarge = !isWithinLimit
                item.isTooLargeReason = reason
            }

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

        // Remove the Cody Chat Memory from showing up in the context list.
        // TODO: Remove this once the Cody Chat Memory is out of experimental.
        result.added = this.contextItems.filter(
            c => result.added.includes(c) && c.title !== 'Cody Chat Memory'
        )
        return result
    }
}
