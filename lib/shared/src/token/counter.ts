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
 */
export class TokenCounter {
    /**
     * The maximum number of tokens that can be used by Chat Messages.
     */
    public readonly maxChatTokens: number
    /**
     * The maximum number of tokens that can be used by the context: user and enhanced.
     * Enhanced tokens will always share a % of the same budget with chat.
     */
    public readonly maxContextTokens: ChatContextTokenUsage
    /**
     * The number of tokens used by messages and context.
     * NOTE: This gets reset everytime a new prompt building process starts, aka in PromptBuilder constructor.
     */
    private usedTokens: ChatMessageTokenUsage & ChatContextTokenUsage = { chat: 0, user: 0, enhanced: 0 }
    /**
     * Indicates whether the chat and user context tokens share the same budget.
     * If false, the user context will have separate budgets.
     * If true, the user context and enhanced token usage will also be deducted when chat usage goes down.
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
     * Gets the remaining token budget for chat, user context, and enhanced context.
     *
     * The remaining token budget is calculated by subtracting the used tokens from the maximum allowed tokens for each category.
     * The enhanced context token budget is calculated as a percentage of the remaining chat token budget.
     *
     * @returns An object containing the remaining token budgets for chat, user context, and enhanced context.
     */
    public get remainingTokens(): TokenBudget {
        const chat = Math.max(0, this.maxChatTokens - this.usedTokens.chat)
        const user = Math.max(0, this.maxContextTokens.user - this.usedTokens.user)
        // Enhanced context tokens will always use the same % of the latest chat budget,
        // so we don't need to deduct the enhanced token usage for its own budget.
        // Instead, we calculate the enhanced token usage based on the latest chat budget.
        const enhanced = Math.max(0, Math.floor(chat * ENHANCED_CONTEXT_ALLOCATION))
        return { chat, context: { user, enhanced } }
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
     * Checks if the specified token usage type has enough remaining tokens to allocate the given count.
     *
     * NOTE: In cases where shareChatAndUserContextBudget is true (context share budget with chat):
     * When constructing the prompt, the chat prompt has the highest priority and is built first using the budget.
     * If there are tokens remaining after building the chat prompt, the user context prompt is then built
     * using the remaining tokens. If there are no tokens left after building the chat prompt,
     * no user context will be added.
     *
     * @param type - The type of token usage to check.
     * @param count - The number of tokens to allocate.
     * @returns `true` if the tokens can be allocated, `false` otherwise.
     */
    private canAllocateTokens(type: 'chat' | ContextTokenUsageType, count: number): boolean {
        return (type === 'chat' ? this.remainingTokens.chat : this.remainingTokens.context[type]) > count
    }

    /**
     * Allocates the specified number of tokens for the given token usage type.
     *
     * When `shareChatAndUserBudget` is active, the chat and user context token usage are kept in sync.
     * Otherwise, the token usage is updated separately for each type.
     *
     * For 'enhanced' token usage, the tokens are always calculated based on the latest chat budget,
     * so the enhanced token usage is not tracked separately but will count towards the chat token usage.
     *
     * @param type - The type of token usage to allocate.
     * @param count - The number of tokens to allocate.
     */
    private allocateTokens(type: 'chat' | ContextTokenUsageType, count: number): void {
        let { chat, user, enhanced } = this.usedTokens

        // When shareChatAndUserBudget is true, we just keep the chat and user context in sync.
        if (this.shareChatAndUserBudget) {
            chat += count
            user += count
        } else {
            // Updates the token usage for the specified type...
            // Enhanced context tokens are always calculated based on the latest chat budget.
            // So, we don't need to keep track of the enhanced token usage separately,
            // but we need to update chat usage.
            if (type === 'chat' || type === 'enhanced') {
                chat += count
            } else {
                user += count
            }
        }

        this.usedTokens = { chat, user, enhanced }
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
