import { getEncoding } from 'js-tiktoken'
import { type Message, tokensToChars } from '..'
import { CHAT_TOKEN_BUDGET, ENHANCED_CONTEXT_ALLOCATION, USER_CONTEXT_TOKEN_BUDGET } from './constants'

export class TokenCounter {
    /**
     * The maximum number of tokens that can be used by Chat Messages.
     */
    private maxTokens: number
    /**
     * The maximum number of tokens that can be used by each context type.
     */
    private maxContextTokens: { user: number; enhanced: number }
    /**
     * The number of tokens used by each token limit type.
     */
    private usedTokens: { messages: number; context: { user: number; enhanced: number } }

    constructor(modelTokenLimit: number) {
        // If the model token limit is less than the default chat token budget,
        // set the chat token budget based on the model token limit.
        const chatTokenBudget = Math.min(modelTokenLimit, CHAT_TOKEN_BUDGET)
        this.maxTokens = chatTokenBudget
        this.maxContextTokens = {
            user: USER_CONTEXT_TOKEN_BUDGET,
            enhanced: Math.floor(chatTokenBudget * ENHANCED_CONTEXT_ALLOCATION),
        }
        this.usedTokens = {
            messages: 0,
            context: {
                user: 0,
                enhanced: 0,
            },
        }
    }

    /**
     * Gets the current remaining token usage for the TokenCounter.
     */
    public get remainingTokens(): { messages: number; context: { user: number; enhanced: number } } {
        return {
            messages: this.maxTokens - this.usedTokens.messages,
            context: {
                user: this.maxContextTokens.user - this.usedTokens.context.user,
                enhanced: this.maxContextTokens.enhanced - this.usedTokens.context.enhanced,
            },
        }
    }

    public updateChatUsage(messages: Message[]): boolean {
        const count = TokenCounter.getMessagesTokenCount(messages)
        const isWithinLimit = this.maxTokens >= this.usedTokens.messages + count
        if (isWithinLimit) {
            this.usedTokens.messages += count
        }
        return isWithinLimit
    }

    public updateEnhancedContextUsage(messages: Message[]): boolean {
        const count = TokenCounter.getMessagesTokenCount(messages)
        const maxContextTokens = this.maxContextTokens.enhanced
        const usedContextTokens = this.usedTokens.context.enhanced
        const isWithinLimit = maxContextTokens > usedContextTokens + count
        if (isWithinLimit) {
            this.usedTokens.context.enhanced += count
        }
        return isWithinLimit
    }

    public updateUserContextUsage(messages: Message[]): boolean {
        const count = TokenCounter.getMessagesTokenCount(messages)
        const maxContextTokens = this.maxContextTokens.user
        const usedContextTokens = this.usedTokens.context.user
        const isWithinLimit = maxContextTokens > usedContextTokens + count
        if (isWithinLimit) {
            this.usedTokens.context.user += count
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
