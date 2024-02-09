import { type Message, isCodyIgnoredFile } from '@sourcegraph/cody-shared'
import type { ContextItem } from './types'
import { contextItemId, renderContextItem } from './utils'
import { truncatePrompt } from '@sourcegraph/cody-shared/src/chat/transcript'
import { MAX_AVAILABLE_PROMPT_LENGTH } from '@sourcegraph/cody-shared/src/prompt/constants'

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
            numChars += message.speaker.length + (message.text?.length || 0) + 3 // space and 2 newlines
        }
        if (numChars + this.charsUsed > this.charLimit) {
            return false
        }
        this.prefixMessages.push(...messages)
        this.charsUsed += numChars
        return true
    }

    public tryAdd(message: Message): boolean {
        const lastMessage = this.reverseMessages.at(-1)
        if (lastMessage?.speaker === message.speaker) {
            throw new Error('Cannot add message with same speaker as last message')
        }

        const msgLen = message.speaker.length + (message.text?.length || 0) + 3 // space and 2 newlines
        if (this.charsUsed + msgLen > this.charLimit) {
            return false
        }
        this.reverseMessages.push(message)
        this.charsUsed += msgLen
        return true
    }

    /**
     * Tries to add context items to the prompt, tracking characters used.
     * Returns info about which items were used vs. ignored.
     */
    public tryAddContext(
        contextItems: ContextItem[],
        charLimit?: number
    ): {
        limitReached: boolean
        used: ContextItem[]
        ignored: ContextItem[]
        duplicate: ContextItem[]
    } {
        const effectiveCharLimit = charLimit ? this.charsUsed + charLimit : this.charLimit
        let limitReached = false
        const used: ContextItem[] = []
        const ignored: ContextItem[] = []
        const duplicate: ContextItem[] = []
        for (const contextItem of contextItems) {
            if (contextItem.uri.scheme === 'file' && isCodyIgnoredFile(contextItem.uri)) {
                ignored.push(contextItem)
                continue
            }
            const id = contextItemId(contextItem)
            if (this.seenContext.has(id)) {
                duplicate.push(contextItem)
                continue
            }
            const contextMessages = truncatePrompt(
                renderContextItem(contextItem).reverse(),
                MAX_AVAILABLE_PROMPT_LENGTH
            )
            const contextLen = contextMessages.reduce(
                (acc, msg) => acc + msg.speaker.length + (msg.text?.length || 0) + 3,
                0
            )
            if (this.charsUsed + contextLen > effectiveCharLimit) {
                ignored.push(contextItem)
                limitReached = true
                continue
            }
            this.seenContext.add(id)
            this.reverseMessages.push(...contextMessages)
            this.charsUsed += contextLen
            used.push(contextItem)
        }
        return {
            limitReached,
            used,
            ignored,
            duplicate,
        }
    }
}
