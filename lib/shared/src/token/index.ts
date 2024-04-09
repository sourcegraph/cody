import { getEncoding } from 'js-tiktoken'
import type { Message } from '..'
import { CHAT_TOKEN_BUDGET, type ContextTokenUsageType, USER_CONTEXT_TOKEN_BUDGET } from './constants'

interface MessageTokenUsage {
    chat: number
}

interface ContextTokenUsage {
    user: number
    enhanced: number
}

/**
 * A class to manage the token usage during prompt building.
 */
export class TokenCounter {
    /**
     * The maximum number of tokens that can be used by Chat Messages.
     */
    private maxChatTokens: number
    /**
     * The maximum number of tokens that can be used by the context.
     */
    private maxContextTokens: ContextTokenUsage
    /**
     * The number of tokens used by messages and context.
     */
    private usedTokens: MessageTokenUsage & ContextTokenUsage

    constructor(totalTokenLimit: number) {
        // If the token limit for the chat model is less than the default chat token budget,
        // set the chat token budget based on the model token limit.
        const messageTokenBudget = Math.min(totalTokenLimit, CHAT_TOKEN_BUDGET)
        this.maxChatTokens = messageTokenBudget

        const contextTokenBudget = totalTokenLimit - messageTokenBudget
        if (contextTokenBudget < USER_CONTEXT_TOKEN_BUDGET) {
            console.warn('Total token limit is too low to accommodate the user context token budget.')
        }

        // Adjusted the calculation of maxContextTokens to ensure that user and enhanced budgets are
        // within the available contextTokenBudget.
        this.maxContextTokens = {
            user: Math.min(contextTokenBudget, USER_CONTEXT_TOKEN_BUDGET),
            enhanced: Math.max(0, contextTokenBudget - USER_CONTEXT_TOKEN_BUDGET),
        }

        this.usedTokens = {
            chat: 0,
            user: 0,
            enhanced: 0,
        }
    }

    /**
     * Gets the current remaining token usage for the TokenCounter.
     */
    public get remainingTokens(): { chat: number; context: { user: number; enhanced: number } } {
        return {
            chat: this.maxChatTokens - this.usedTokens.chat,
            context: {
                user: this.maxContextTokens.user - this.usedTokens.user,
                enhanced: this.maxContextTokens.enhanced - this.usedTokens.enhanced,
            },
        }
    }

    /**
     * Updates the chat token usage by calculating the token count for the provided messages and adding it to the used token count.
     * Returns a boolean indicating whether the updated token usage is within the maximum chat token limit.
     *
     * @param messages - The messages to calculate the token count for.
     * @returns A boolean indicating whether the updated token usage is within the maximum chat token limit.
     */
    public updateChatUsage(messages: Message[]): boolean {
        const count = TokenCounter.getMessagesTokenCount(messages)
        const isWithinLimit = this.maxChatTokens > this.usedTokens.chat + count
        if (isWithinLimit) {
            this.usedTokens.chat += count
        }
        return isWithinLimit
    }

    /**
     * Updates the usage of context tokens for the specified context token usage type.
     *
     * @param type - The context token usage type (e.g. 'user', 'enhanced').
     * @param messages - The messages to calculate the token count for.
     * @returns `true` if the token usage is within the limit, `false` otherwise.
     */
    public updateContextUsage(type: ContextTokenUsageType, messages: Message[]): boolean {
        const count = TokenCounter.getMessagesTokenCount(messages)
        const maxContextTokens = this.maxContextTokens[type]
        const usedContextTokens = this.usedTokens[type]
        const isWithinLimit = maxContextTokens > usedContextTokens + count
        if (isWithinLimit) {
            this.usedTokens[type] += count
        }
        return isWithinLimit
    }

    /**
     * The default tokenizer is cl100k_base.
     */
    private static tokenize = getEncoding('cl100k_base')

    /**
     * Encode the given text using the tokenizer.
     * The text is first normalized to NFKC to handle different character representations consistently.
     * All special tokens are included in the token count.
     */
    public static encode(text: string): number[] {
        return TokenCounter.tokenize.encode(text.normalize('NFKC'), 'all')
    }

    /**
     * Counts the number of tokens in the given text using the tokenizer.
     *
     * @param text - The input text to count tokens for.
     * @returns The number of tokens in the input text.
     */
    public static countTokens(text: string): number {
        return TokenCounter.encode(text).length
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
}
