import { getEncoding } from 'js-tiktoken'
import type { ChatContextTokenUsage, ContextTokenUsageType, TokenBudget, TokenUsageType } from '.'
import type { Message, ModelContextWindow } from '..'
import { ENHANCED_CONTEXT_ALLOCATION } from './constants'

/**
 * A class to manage the token usage during prompt building.
 *
 * A new TokenCounter is created everytime a new prompt building process starts in PromptBuilder constructor.
 */
export class TokenCounter {
    /**
     * The maximum number of tokens that can be used by Chat Messages.
     */
    public readonly maxChatTokens: number
    /**
     * The maximum number of tokens that can be used by each context type:
     * - User-Context: tokens reserved for User-added context, like @-mentions.
     * - Enhanced-Context: % (defined by ENHANCED_CONTEXT_ALLOCATION) of the latest Chat budget.
     */
    public readonly maxContextTokens: ChatContextTokenUsage
    /**
     * The number of tokens used by Chat messages and User-Context.
     */
    private usedTokens: { chat: number; user: number } = { chat: 0, user: 0 }
    /**
     * Indicates whether the Chat and User-Context share the same token budget.
     * - If true, the User-Context will use a separate budget.
     * - If false, all types of messages (chat and any type of context) share the same token budget with Chat.
     *
     * This is used in allocateTokens to determine how to allocate tokens for different types of messages.
     */
    private shareChatAndUserBudget = false

    constructor(contextWindow: ModelContextWindow) {
        // If there is no context window reserved for context.user,
        // context will share the same token budget with chat.
        this.shareChatAndUserBudget = !contextWindow.context?.user
        this.maxChatTokens = contextWindow.input
        this.maxContextTokens = {
            user: contextWindow.context?.user ?? contextWindow.input,
            enhanced: Math.floor(contextWindow.input * ENHANCED_CONTEXT_ALLOCATION),
        }
    }

    /**
     * Updates the token usage for the messages of a specified token usage type.
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
     * If `shareChatAndUserBudget` is true (separate User-Context budget mode):
     *   - User-Context has a separate token budget from Chat.
     *   - Enhanced-Context shares a % of the available token budget for Chat.
     * If `shareChatAndUserBudget` is false (shared budget mode):
     *   - All types of messages (Chat, Enhanced-Context, and User-Context) share the same Chat token budget.
     *
     * NOTE: In both budget modes, Enhanced-Context's token usage is counted towards the Chat token usage.
     *
     * @param type - The type of token usage to allocate.
     * @param count - The number of tokens to allocate.
     */
    private allocateTokens(type: 'chat' | ContextTokenUsageType, count: number): void {
        let { chat, user } = this.usedTokens
        // Update token usage based on the specified type and budget mode
        if (this.shareChatAndUserBudget) {
            // In shared budget mode, update Chat and User-Context token usage together
            chat += count
            user += count
        } else {
            // In separate User-Context budget mode
            if (type === 'chat' || type === 'enhanced') {
                // Update chat usage for Chat and Enhanced-Context tokens
                chat += count
            } else {
                // Update user usage for User-Context tokens
                user += count
            }
        }
        this.usedTokens = { chat, user }
    }

    /**
     * Calculates the remaining token budget for each token usage type:
     *   1. Chat: Calculated by subtracting the used chat tokens from the maximum allowed chat tokens.
     *   2. User-Context: Calculated by subtracting the used User-Context tokens from the maximum allowed User-Context tokens.
     *   3. Enhanced-Context: A percentage (defined by ENHANCED_CONTEXT_ALLOCATION) of the remaining chat tokens.
     *
     * @returns The remaining token budget for chat, User-Context, and Enhanced-Context (if applicable).
     */
    private get remainingTokens(): TokenBudget {
        const chat = Math.max(0, this.maxChatTokens - this.usedTokens.chat)
        const user = Math.max(0, this.maxContextTokens.user - this.usedTokens.user)
        const enhanced = Math.max(0, Math.floor(chat * ENHANCED_CONTEXT_ALLOCATION))
        return { chat, context: { user, enhanced } }
    }

    /**
     * Checks if the specified token usage type has enough remaining tokens to allocate the given count.
     *
     * @param type - The type of token usage to check.
     * @param count - The number of tokens to allocate.
     * @returns `true` if the tokens can be allocated, `false` otherwise.
     */
    private canAllocateTokens(type: 'chat' | ContextTokenUsageType, count: number): boolean {
        return (type === 'chat' ? this.remainingTokens.chat : this.remainingTokens.context[type]) > count
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
