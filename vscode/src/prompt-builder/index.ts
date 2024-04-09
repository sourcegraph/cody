import {
    type ChatMessage,
    type ContextItem,
    type ContextMessage,
    type Message,
    type TokenCounter,
    isCodyIgnoredFile,
    toRangeData,
} from '@sourcegraph/cody-shared'
import type { ContextTokenUsageType } from '@sourcegraph/cody-shared/src/token/constants'
import { SHA256 } from 'crypto-js'
import { renderContextItem } from './utils'

interface PromptBuilderContextResult {
    limitReached: boolean
    used: ContextItem[]
    ignored: ContextItem[]
    duplicate: ContextItem[]
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
    private seenContext = new Set<string>()
    constructor(private tokenCounter: TokenCounter) {}

    public build(): Message[] {
        return this.prefixMessages.concat([...this.reverseMessages].reverse())
    }

    public tryAddToPrefix(messages: Message[]): boolean {
        const isAdded = this.tokenCounter.updateChatUsage(messages)
        if (isAdded) {
            this.prefixMessages.push(...messages)
        }
        return isAdded
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
            const isAdded = this.tokenCounter.updateChatUsage([humanMsg, assistantMsg])
            if (!isAdded) {
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
        type: ContextTokenUsageType,
        contextMessages: (ContextItem | ContextMessage)[]
    ): PromptBuilderContextResult {
        const result = {
            limitReached: false, // Indicates if the token budget was exceeded
            used: [] as ContextItem[], // The items that were successfully added
            ignored: [] as ContextItem[], // The items that were ignored
            duplicate: [] as ContextItem[], // The items that were duplicates of previously seen items
        }
        // Create a new array to avoid modifying the original array, then reverse it to process the newest context items first.
        const reversedContextItems = contextMessages.slice().reverse()
        for (const item of reversedContextItems) {
            const userContextItem = contextItem(item)
            const id = contextItemId(item)
            // Skip context items that are in the Cody ignore list
            if (isCodyIgnoredFile(userContextItem.uri)) {
                result.ignored.push(userContextItem)
                continue
            }
            // Skip context items that have already been seen
            if (this.seenContext.has(id)) {
                result.duplicate.push(userContextItem)
                continue
            }
            const contextMsg = isContextItem(item) ? renderContextItem(item) : item
            if (!contextMsg) {
                continue
            }
            const assistantMsg = { speaker: 'assistant', text: 'Ok.' } as Message
            const isAdded = this.tokenCounter.updateContextUsage(type, [contextMsg, assistantMsg])
            // Marks excluded context items as too large and vice versa
            userContextItem.isTooLarge = !isAdded
            this.seenContext.add(id)
            // Skip context items that would exceed the token budget
            if (!isAdded) {
                userContextItem.content = undefined
                result.ignored.push(userContextItem)
                result.limitReached = true
                continue
            }
            this.reverseMessages.push(assistantMsg, contextMsg)
            result.used.push(userContextItem)
        }
        return result
    }
}

function isContextItem(value: ContextItem | ContextMessage): value is ContextItem {
    return 'uri' in value && 'type' in value && !('speaker' in value)
}

function contextItem(value: ContextItem | ContextMessage): ContextItem {
    return isContextItem(value) ? value : value.file
}

function contextItemId(value: ContextItem | ContextMessage): string {
    const item = contextItem(value)

    // HACK: Handle `item.range` values that were serialized from `vscode.Range` into JSON `[start,
    // end]`. If a value of that type exists in `item.range`, it's a bug, but it's an easy-to-hit
    // bug, so protect against it. See the `toRangeData` docstring for more.
    const range = toRangeData(item.range)
    if (range) {
        return `${item.uri.toString()}#${range.start.line}:${range.end.line}`
    }

    if (item.content) {
        return `${item.uri.toString()}#${SHA256(item.content).toString()}`
    }

    return item.uri.toString()
}
