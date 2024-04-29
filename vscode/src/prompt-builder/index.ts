import {
    type ChatMessage,
    type ContextItem,
    type ContextMessage,
    type Message,
    type ModelContextWindow,
    TokenCounter,
    isCodyIgnoredFile,
    ps,
} from '@sourcegraph/cody-shared'
import type { ContextTokenUsageType } from '@sourcegraph/cody-shared/src/token'
import { ContextTracker } from './context-tracker'
import { renderContextItem } from './utils'

interface PromptBuilderContextResult {
    limitReached: boolean
    used: ContextItem[]
    ignored: ContextItem[]
}

/**
 * PromptBuilder constructs a full prompt given a charLimit constraint.
 * The final prompt is constructed by concatenating the following fields:
 * - prefixMessages
 * - the reverse of reverseMessages
 */
export class PromptBuilder {
    private prefixMessages: Message[] = []
    private reverseMessages: Message[] = []

    private processedContextType = new Set<ContextTokenUsageType>()
    private addedContextItems: ContextItem[] = []

    private tokenCounter: TokenCounter

    constructor(contextWindow: ModelContextWindow) {
        this.tokenCounter = new TokenCounter(contextWindow)
    }

    public build(): Message[] {
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

    public tryAddContext(
        tokenType: ContextTokenUsageType,
        contextMessages: (ContextItem | ContextMessage)[]
    ): PromptBuilderContextResult {
        this.processedContextType.add(tokenType)
        const contextTracker = new ContextTracker(this.addedContextItems)
        const result = {
            limitReached: false, // Indicates if the token budget was exceeded
            ignored: [] as ContextItem[], // The items that were ignored
        }

        // Create a new array to avoid modifying the original array, then reverse it to process the newest context items first.
        const reversedContextItems = contextMessages.slice().reverse()
        for (const item of reversedContextItems) {
            const userContextItem = contextItem(item)
            // Skip context items that are in the Cody ignore list
            if (isCodyIgnoredFile(userContextItem.uri)) {
                result.ignored.push(userContextItem)
                continue
            }

            // Skip duplicated or invalid items before updating the token usage.
            const isTrackable = contextTracker.add(userContextItem)
            const contextMsg = isContextItem(item) ? renderContextItem(item) : item
            if (!contextMsg || !isTrackable) {
                continue
            }

            const assistantMsg = { speaker: 'assistant', text: ps`Ok.` } as Message
            const withinLimit = this.tokenCounter.updateUsage(tokenType, [contextMsg, assistantMsg])
            // We do not want to update exisiting context items from chat history that's not related to last human message,
            // unless isTooLarge is undefined, meaning it has not been processed before like new enhanced context.
            if (
                (tokenType === 'user' && !this.processedContextType.has(tokenType)) ||
                userContextItem.isTooLarge === undefined
            ) {
                userContextItem.isTooLarge = !withinLimit
            }

            // Skip context items that would exceed the token budget.
            // Also remove them from the context tracker,  and add them to the ignored list.
            if (!withinLimit) {
                contextTracker.remove(userContextItem)
                userContextItem.content = undefined
                result.ignored.push(userContextItem)
                result.limitReached = true
                continue
            }

            this.reverseMessages.push(assistantMsg, contextMsg)
        }

        const used = contextTracker.added
        this.addedContextItems.push(...used)

        return { ...result, used }
    }
}

function isContextItem(value: ContextItem | ContextMessage): value is ContextItem {
    return 'uri' in value && 'type' in value && !('speaker' in value)
}

function contextItem(value: ContextItem | ContextMessage): ContextItem {
    return isContextItem(value) ? value : value.file
}
