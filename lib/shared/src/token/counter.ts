import { getEncoding } from 'js-tiktoken'
import type {
    ChatContextTokenUsage,
    ChatMessageTokenUsage,
    ContextTokenUsageType,
    TokenBudget,
    TokenUsageType,
} from '.'
import type { Message, PromptString } from '..'
import { CHAT_TOKEN_BUDGET, ENHANCED_CONTEXT_ALLOCATION, USER_CONTEXT_TOKEN_BUDGET } from './constants'

/**
 * A class to manage the token usage during prompt building.
 */
export class TokenCounter {
    /**
     * The maximum number of tokens that can be used by Chat Messages.
     */
    public readonly maxChatTokens: number
    /**
     * The maximum number of tokens that can be used by the context.
     */
    public readonly maxContextTokens: ChatContextTokenUsage
    /**
     * The number of tokens used by messages and context.
     */
    private usedTokens: ChatMessageTokenUsage & ChatContextTokenUsage = { chat: 0, user: 0, enhanced: 0 }
    /**
     * Indicates whether the chat and user context tokens share the same budget.
     */
    private shareChatAndUserContextBudget = false

    constructor(public readonly totalBudget: number) {
        // Set the maximum number of tokens that can be used by chat and context.
        // This allows the token counter to allocate the budget between chat and context tokens
        // based on the total budget.
        // NOTE: The totalBudget of Claude-3 models is CHAT_TOKEN_BUDGET + USER_CONTEXT_TOKEN_BUDGET.
        const chatTokenBudget = Math.min(totalBudget, CHAT_TOKEN_BUDGET)
        this.maxContextTokens = {
            // If the total budget is less than the default user context token budget,
            // use the total budget as the user context token budget.
            user: Math.min(totalBudget, USER_CONTEXT_TOKEN_BUDGET),
            // Enhanced context token budget can be up to a percentage of the chat token budget.
            enhanced: Math.floor(chatTokenBudget * ENHANCED_CONTEXT_ALLOCATION),
        }

        // If the chat token budget is equal to the user context token budget,
        // the chat and user context tokens will share the same budget.
        this.shareChatAndUserContextBudget = chatTokenBudget === this.maxContextTokens.user
        this.maxChatTokens = chatTokenBudget
    }

    /**
     * Gets the current remaining token usage for the TokenCounter.
     */
    public get remainingTokens(): TokenBudget {
        return {
            chat: Math.max(0, this.maxChatTokens - this.usedTokens.chat),
            context: {
                user: Math.max(0, this.maxContextTokens.user - this.usedTokens.user),
                enhanced: Math.max(0, this.maxContextTokens.enhanced - this.usedTokens.enhanced),
            },
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
     * Checks if the specified token usage type has enough remaining tokens to allocate the given count.
     *
     * @param type - The type of token usage to check.
     * @param count - The number of tokens to allocate.
     * @returns `true` if the tokens can be allocated, `false` otherwise.
     */
    private canAllocateTokens(type: 'chat' | ContextTokenUsageType, count: number): boolean {
        const remaining =
            type === 'chat' ? this.remainingTokens.chat : this.remainingTokens.context[type]
        return remaining > count
    }

    /**
     * Allocates the specified number of tokens for the given token usage type.
     * If the token usage type is 'chat' and the chat and user context tokens share the same budget,
     * the user context and enhanced tokens will also be updated.
     *
     * @param type - The type of token usage to allocate.
     * @param count - The number of tokens to allocate.
     */
    private allocateTokens(type: 'chat' | ContextTokenUsageType, count: number): void {
        this.usedTokens[type] += count
        if (type === 'chat' && this.shareChatAndUserContextBudget) {
            // If chat and user context tokens share the same budget, update both.
            this.usedTokens.user += count
            this.usedTokens.enhanced += count // Enhanced tokens should also be deducted.
        }
    }

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

    public static countPromptString(text: PromptString): number {
        return TokenCounter.encode(text.toString()).length
    }

    /**
     * Counts the number of tokens in the given message using the tokenizer.
     *
     * @param message - The message to count tokens for.
     * @returns The number of tokens in the message.
     */
    private static getTokenCountForMessage(message: Message): number {
        if (message?.text && message?.text.length > 0) {
            return TokenCounter.countPromptString(message.text)
        }
        return 0
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
