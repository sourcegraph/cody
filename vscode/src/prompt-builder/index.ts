import {
    type ChatMessage,
    type ContextItem,
    type ContextMessage,
    type Message,
    isCodyIgnoredFile,
    toRangeData,
} from '@sourcegraph/cody-shared'
import { ContextItemSource } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { SHA256 } from 'crypto-js'
import { renderContextItem } from './utils'

const isAgentTesting = typeof process !== 'undefined' && process.env.CODY_SHIM_TESTING === 'true'

/**
 * PromptBuilder constructs a full prompt given a charLimit constraint.
 * The final prompt is constructed by concatenating the following fields:
 * - prefixMessages
 * - the reverse of reverseMessages
 */
export class PromptBuilder {
    private prefixMessages: Message[] = []
    private reverseMessages: Message[] = []
    private charsUsed = 0
    private seenContext = new Set<string>()
    constructor(private readonly charLimit: number) {}

    public build(): Message[] {
        return this.prefixMessages.concat([...this.reverseMessages].reverse())
    }

    public tryAddToPrefix(messages: Message[]): boolean {
        let numChars = 0
        for (const message of messages) {
            numChars += messageChars(message)
        }
        if (numChars + this.charsUsed > this.charLimit) {
            return false
        }
        this.prefixMessages.push(...messages)
        this.charsUsed += numChars
        return true
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
            const countChar = (msg: Message) => msg.speaker.length + (msg.text?.length || 0) + 3
            const msgLen = countChar(humanMsg) + (assistantMsg ? countChar(assistantMsg) : 0)
            if (this.charsUsed + msgLen > this.charLimit) {
                return reverseTranscript.length - i + (assistantMsg ? 1 : 0)
            }
            if (assistantMsg) {
                this.reverseMessages.push(assistantMsg)
            }
            this.reverseMessages.push(humanMsg)
            this.charsUsed += msgLen
        }
        return 0
    }

    /**
     * Tries to add context items to the prompt, tracking characters used.
     * Returns info about which items were used vs. ignored.
     *
     * If charLimit is specified, then imposes an additional limit on the
     * amount of context added from contextItems. This does not affect the
     * overall character limit, which is still enforced.
     */
    public tryAddContext(
        contextItemsAndMessages: (ContextItem | ContextMessage)[],
        charLimit?: number
    ): {
        limitReached: boolean
        used: ContextItem[]
        ignored: ContextItem[]
        duplicate: ContextItem[]
    } {
        let effectiveCharLimit = this.charLimit - this.charsUsed
        if (charLimit && charLimit < effectiveCharLimit) {
            effectiveCharLimit = charLimit
        }

        let limitReached = false
        const used: ContextItem[] = []
        const ignored: ContextItem[] = []
        const duplicate: ContextItem[] = []
        if (isAgentTesting) {
            // Need deterministic ordering of context files for the tests to pass
            // consistently across different file systems.
            contextItemsAndMessages.sort((a, b) =>
                contextItem(a).uri.path.localeCompare(contextItem(b).uri.path)
            )
            // Move the selectionContext to the first position so that it'd be
            // the last context item to be read by the LLM to avoid confusions where
            // other files also include the selection text in test files.
            const selectionContext = contextItemsAndMessages.find(
                item =>
                    (isContextItem(item) ? item.source : item.file.source) ===
                    ContextItemSource.Selection
            )
            if (selectionContext) {
                contextItemsAndMessages.splice(contextItemsAndMessages.indexOf(selectionContext), 1)
                contextItemsAndMessages.unshift(selectionContext)
            }
        }
        for (const v of contextItemsAndMessages) {
            const item = contextItem(v)
            const uri = contextItem(v).uri
            if (uri.scheme === 'file' && isCodyIgnoredFile(uri)) {
                ignored.push(item)
                continue
            }
            const id = contextItemId(v)
            if (this.seenContext.has(id)) {
                duplicate.push(item)
                continue
            }
            const contextMessage = isContextItem(v) ? renderContextItem(v) : v
            const contextLen = contextMessage
                ? contextMessage.speaker.length + contextMessage.text.length + 3
                : 0
            if (this.charsUsed + contextLen > effectiveCharLimit) {
                // Marks excluded context items as too large to be displayed in UI
                if (item.type === 'file') {
                    item.isTooLarge = true
                }
                ignored.push(item)
                limitReached = true
                continue
            }
            this.seenContext.add(id)
            if (contextMessage) {
                this.reverseMessages.push({ speaker: 'assistant', text: 'Ok.' })
                this.reverseMessages.push(contextMessage)
            }
            this.charsUsed += contextLen
            // Marks added file items as not too large
            if (item.type === 'file') {
                item.isTooLarge = false
            }
            used.push(item)
        }
        return {
            limitReached,
            used,
            ignored,
            duplicate,
        }
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

function messageChars(message: Message): number {
    return message.speaker.length + (message.text?.length || 0) + 3 // space and 2 newlines
}
