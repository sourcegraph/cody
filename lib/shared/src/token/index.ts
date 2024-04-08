import { getEncoding } from 'js-tiktoken'
import { type Message, tokensToChars } from '..'
import { CHAT_TOKEN_BUDGET, ENHANCED_CONTEXT_ALLOCATION, USER_CONTEXT_TOKEN_BUDGET } from './constants'

export class TokenCounter {
    private max = {
        messages: CHAT_TOKEN_BUDGET,
        context: {
            user: USER_CONTEXT_TOKEN_BUDGET,
            enhanced: Math.floor(CHAT_TOKEN_BUDGET * ENHANCED_CONTEXT_ALLOCATION),
        },
    }

    private usage = {
        messages: 0,
        context: {
            user: 0,
            enhanced: 0,
        },
    }

    /**
     * Initializes the TokenCounter with a maximum token limit for the model.
     * If the provided `modelTokenLimit` is less than the global `CHAT_TOKEN_BUDGET`,
     * the maximum number of tokens for messages is set to the provided limit.
     * The maximum number of tokens for enhanced context is calculated as a fraction
     * of the maximum message tokens, based on the `ENHANCED_CONTEXT_ALLOCATION` constant.
     *
     * @param modelTokenLimit - The maximum number of tokens the model can handle.
     */
    constructor(modelTokenLimit: number) {
        if (modelTokenLimit < CHAT_TOKEN_BUDGET) {
            this.max.messages = modelTokenLimit
        }
        this.max.context.enhanced = Math.floor(this.max.messages * ENHANCED_CONTEXT_ALLOCATION)
    }

    /**
     * Gets the current remaining token usage for the TokenCounter.
     */
    public get remainingTokens(): { messages: number; context: { user: number; enhanced: number } } {
        return {
            messages: this.max.messages - this.usage.messages,
            context: {
                user: this.max.context.user - this.usage.context.user,
                enhanced: this.max.context.enhanced - this.usage.context.enhanced,
            },
        }
    }

    public updateChatUsage(messages: Message[]): boolean {
        const count = TokenCounter.getMessagesTokenCount(messages)
        const isWithinLimit = this.max.messages > this.usage.messages + count
        if (isWithinLimit) {
            this.usage.messages += count
        }
        return isWithinLimit
    }

    public updateEnhancedContextUsage(messages: Message[]): boolean {
        const count = TokenCounter.getMessagesTokenCount(messages)
        const isWithinLimit = this.max.context.enhanced > this.usage.context.enhanced + count
        if (isWithinLimit) {
            this.usage.context.enhanced += count
        }
        return isWithinLimit
    }

    public updateUserContextUsage(messages: Message[]): boolean {
        const count = TokenCounter.getMessagesTokenCount(messages)
        const isWithinLimit = this.max.context.user > this.usage.context.user + count
        if (isWithinLimit) {
            this.usage.context.user += count
        }
        return isWithinLimit
    }

    private static tokenize = getEncoding('cl100k_base')

    /**
     * Counts the number of tokens in the given text using the tokenizer.
     * The text is first normalized to NFKC to handle different character representations consistently.
     * All special tokens are included in the token count.
     *
     * @param text - The input text to count tokens for.
     * @returns The number of tokens in the input text.
     */
    public static countTokens(text: string): number {
        // Normalize the text to NFKC to handle different character representations consistently.
        // Set allowedSpecial to 'all' to include all special tokens in the token count.
        return TokenCounter.tokenize.encode(text.normalize('NFKC'), 'all').length
    }

    /**
     * Counts the number of tokens in the given message using the tokenizer.
     *
     * @param message - The message to count tokens for.
     * @returns The number of tokens in the message.
     */
    private static getTokenCountForMessage(message: Message): number {
        if (!message) {
            return 0
        }

        return TokenCounter.countTokens(message.text + message.speaker)
    }

    /**
     * Calculates the total number of tokens across the given array of messages.
     *
     * @param messages - An array of messages to count the tokens for.
     * @returns The total number of tokens in the provided messages.
     */
    public static getMessagesTokenCount(messages: Message[]): number {
        return messages.reduce((acc, m) => acc + TokenCounter.getTokenCountForMessage(m), 0)
    }

    /**
     * Calculates the total number of bytes required to represent the given array of messages.
     *
     * @param messages - An array of messages to calculate the total byte count for.
     * @returns The total number of bytes required to represent the provided messages.
     */
    public static getMessagesByteCount(messages: Message[]): number {
        return tokensToChars(TokenCounter.getMessagesTokenCount(messages))
    }
}
