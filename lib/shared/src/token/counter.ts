import { getEncoding } from 'js-tiktoken'
import type {
    ChatContextTokenUsage,
    ChatMessageTokenUsage,
    ContextTokenUsageType,
    TokenBudget,
    TokenUsageType,
} from '.'
import type { Message } from '..'
import { ENHANCED_CONTEXT_ALLOCATION } from './constants'

/**
 * A class to manage the token usage during prompt building.
 *
 * NOTE: A new TokenCounter is created everytime a new prompt building process starts (PromptBuilder constructor).
 */
export class TokenCounter {
    /**
     * The maximum number of tokens that can be used by Chat Messages.
     */
    public readonly maxChatTokens: number
    /**
     * The maximum number of tokens that can be used by each context type:
     * - User context
     * - Enhanced context
     *     - Enhanced tokens shares ENHANCED_CONTEXT_ALLOCATION% of the Chat budget.
     */
    public readonly maxContextTokens: ChatContextTokenUsage
    /**
     * The number of tokens used by Chat messages and each Context type.
     */
    private usedTokens: ChatMessageTokenUsage & ChatContextTokenUsage = { chat: 0, user: 0, enhanced: 0 }
    /**
     * Indicates whether the chat and user context tokens share the same budget.
     * If false, the user context will have separate budgets.
     * If true, all types of messages (chat, enhanced context, and user @-context) share the same token budget.
     */
    private shareChatAndUserBudget = false

    constructor(contextWindow: { chat: number; user: number; enhanced: number }) {
        // If the context window for user context is 0, context will share the same budget with chat.
        this.shareChatAndUserBudget = contextWindow.user === 0

        this.maxChatTokens = contextWindow.chat
        this.maxContextTokens = {
            user: contextWindow.user || contextWindow.chat,
            // Enhanced context token budget can be up to a percentage of the chat token budget.
            enhanced: Math.floor(contextWindow.chat * ENHANCED_CONTEXT_ALLOCATION),
        }
    }

    /**
     * Updates the token usage for the specified token usage type and messages.
     *
     * @param type - The type of token usage to update.
     * @param messages - The messages to calculate the token count for.
     * @returns `true` if the token usage can be allocated, `false` otherwise.
     */
    public updateUsage(type: TokenUsageType, messages: Message[]): boolean {
        const count = TokenCounter.getMessagesTokenCount(messages)
        const isWithinLimit = this.canAllocateTokens(type, count)
        if (isWithinLimit) {
            this.allocateTokens(type, count)
        }
        return isWithinLimit
    }

    /**
     * Allocates the specified number of tokens for the given token usage type.
     *
     * If `shareChatAndUserBudget` is true (separate user context budget mode):
     *   - User context tokens are counted separately from chat and enhanced context tokens.
     *   - Chat and enhanced context tokens share the same token budget.
     *
     * If `shareChatAndUserBudget` is false (shared budget mode):
     *   - All types of messages (chat, enhanced context, and user @-context) share the same token budget.
     *
     * NOTE: In both budget modes, enhanced context's token usage is counted towards the chat token usage.
     *
     * @param type - The type of token usage to allocate.
     * @param count - The number of tokens to allocate.
     */
    private allocateTokens(type: 'chat' | ContextTokenUsageType, count: number): void {
        let { chat, user, enhanced } = this.usedTokens

        // Update token usage based on the specified type and budget mode
        if (this.shareChatAndUserBudget) {
            // In shared budget mode, update chat and user token usage together
            chat += count
            user += count
        } else {
            // In separate user context budget mode
            if (type === 'chat' || type === 'enhanced') {
                // Update chat usage for chat and enhanced context tokens
                chat += count
            } else {
                // Update user usage for user context tokens
                user += count
            }
        }

        this.usedTokens = { chat, user, enhanced }
    }

    /**
     * Calculates the remaining token budget for each token usage type:
     * 1. Chat:
     *     - Calculated by subtracting the used chat tokens from the maximum allowed chat tokens.
     * 2. User Context:
     *     - Calculated by subtracting the used user context tokens from the maximum allowed user context tokens.
     * 3. Enhanced Context:
     *     - Calculated as a percentage of the remaining chat token budget in all modes
     *
     * @returns The remaining token budget for chat, user context, and enhanced context (if applicable).
     */
    public get remainingTokens(): TokenBudget {
        const chat = Math.max(0, this.maxChatTokens - this.usedTokens.chat)
        const user = Math.max(0, this.maxContextTokens.user - this.usedTokens.user)
        // Enhanced Context token budget is calculated as a percentage of the remaining chat token budget.
        // The precentage is defined by the `ENHANCED_CONTEXT_ALLOCATION` constant.
        const enhanced = Math.max(0, Math.floor(chat * ENHANCED_CONTEXT_ALLOCATION))
        return { chat, context: { user, enhanced } }
    }

    /**
     * Checks if the specified token usage type has enough remaining tokens to allocate the given count.
     *
     * NOTE: When constructing prompt where `shareChatAndUserBudget` is true (separate user context budget mode):
     * - Chat prompt has the highest priority and is built first using its token budget.
     * - If there are tokens remaining after building the Chat prompt:
     *   - User context is built using the remaining Chat tokens.
     * - If there are no tokens left after building the Chat prompt:
     *   - No User context will be added.
     * - Enhanced context is built using a percentage of the remaining Chat tokens.
     *
     * @param type - The type of token usage to check.
     * @param count - The number of tokens to allocate.
     * @returns `true` if the tokens can be allocated, `false` otherwise.
     */
    private canAllocateTokens(type: 'chat' | ContextTokenUsageType, count: number): boolean {
        return (type === 'chat' ? this.remainingTokens.chat : this.remainingTokens.context[type]) > count
    }

    /**
     * Resets the token usage to 0.
     * NOTE: This should be called everytime a new prompt is built.
     * NOTE: Used in the PromptBuilder constructor only.
     */
    public reset(): void {
        this.usedTokens = { chat: 0, user: 0, enhanced: 0 }
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

    public static decode(encoded: number[]): string {
        return TokenCounter.tokenize.decode(encoded)
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
        if (!message?.text) {
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
