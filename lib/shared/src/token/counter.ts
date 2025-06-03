// import { decode, encode } from 'gpt-tokenizer/encoding/cl100k_base'
import type { TokenBudget, TokenUsage } from '.'
import type { ChatContextTokenUsage, TokenUsageType } from '.'
import { EXTENDED_USER_CONTEXT_TOKEN_BUDGET, type ModelContextWindow } from '..'
import type { Message, PromptString } from '..'
import { CORPUS_CONTEXT_ALLOCATION } from './constants'

let _tokenCounterUtilsPromise: Promise<TokenCounterUtils> | null = null

export async function getTokenCounterUtils() {
    if (_tokenCounterUtilsPromise) {
        return _tokenCounterUtilsPromise
    }

    const { detect } = await import('detect-browser')
    const browser = detect()
    if (browser && browser.name === 'safari') {
        _tokenCounterUtilsPromise = import('js-tiktoken/ranks/cl100k_base').then(async tokenizer => {
            const tiktoken = await import('js-tiktoken/lite')
            return createTokenCounterUtils(new tiktoken.Tiktoken(tokenizer.default))
        })
    } else {
        _tokenCounterUtilsPromise = import('gpt-tokenizer/encoding/cl100k_base').then(tokenizer =>
            createTokenCounterUtils(tokenizer)
        )
    }

    return _tokenCounterUtilsPromise
}

type WithPromise<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any
        ? (...args: Parameters<T[K]>) => Promise<ReturnType<T[K]>>
        : T[K]
}
export interface TokenCounterUtils {
    encode(text: string): number[]
    decode(encoded: number[]): string
    countTokens(text: string): number
    countPromptString(text: PromptString): number
    getMessagesTokenCount(messages: (Message | undefined)[]): number
    getTokenCountForMessage(message: Message | undefined): number
}

/**
 * Calling `await TokenCounterUtils.foo()` is the same as `(await getTokenCounterUtils()).foo()`.
 */
export const TokenCounterUtils: WithPromise<TokenCounterUtils> = {
    encode: async (...args) => (await getTokenCounterUtils()).encode(...args),
    decode: async (...args) => (await getTokenCounterUtils()).decode(...args),
    countTokens: async (...args) => (await getTokenCounterUtils()).countTokens(...args),
    countPromptString: async (...args) => (await getTokenCounterUtils()).countPromptString(...args),
    getMessagesTokenCount: async (...args) =>
        (await getTokenCounterUtils()).getMessagesTokenCount(...args),
    getTokenCountForMessage: async (...args) =>
        (await getTokenCounterUtils()).getTokenCountForMessage(...args),
}

function createTokenCounterUtils(tokenizer: any) {
    return {
        encode(text: string): number[] {
            return tokenizer.encode(text.normalize('NFKC'))
        },
        decode(encoded: number[]): string {
            return tokenizer.decode(encoded)
        },
        countTokens(text: string): number {
            const wordCount = text.trim().split(/\s+/).length
            return wordCount > EXTENDED_USER_CONTEXT_TOKEN_BUDGET ? wordCount : this.encode(text).length
        },

        countPromptString(text: PromptString): number {
            return this.countTokens(text.toString())
        },

        getMessagesTokenCount(messages: Message[]): number {
            return messages.reduce((acc, m) => acc + this.getTokenCountForMessage(m), 0)
        },

        getTokenCountForMessage(message: Message): number {
            if (message?.text && message?.text.length > 0) {
                return this.countPromptString(message.text)
            }
            return 0
        },
    }
}

/**
 * A class to manage the token allocation during prompt building.
 */
export class TokenCounter {
    /**
     * The maximum number of tokens that can be used by Chat Messages.
     */
    public readonly maxChatTokens: number
    /**
     * The maximum number of tokens that can be used by each context type:
     * - User-Context: tokens reserved for User-added context, like @-mentions.
     * - Corpus-Context: % (defined by CORPUS_CONTEXT_ALLOCATION) of the latest Chat budget.
     */
    public readonly maxContextTokens: ChatContextTokenUsage
    /**
     * The number of tokens used by chat and context respectively.
     */
    private usedTokens: TokenUsage = { preamble: 0, input: 0, user: 0, corpus: 0 }
    /**
     * Indicates whether the Chat and User-Context share the same token budget.
     * - If true, all types of messages share the same token budget with Chat.
     * - If false (Feature Flag required), the User-Context will has a separated budget.
     * NOTE: Used in remainingTokens for calculating the remaining token budget for each budget type.
     */
    private shareChatAndUserBudget = true

    /**
     * Convenience constructor to await the lazy-import from {@link getTokenCounterUtils} and then
     * call our constructor.
     */
    public static async create(contextWindow: ModelContextWindow): Promise<TokenCounter> {
        return new TokenCounter(await getTokenCounterUtils(), contextWindow)
    }

    private constructor(
        readonly tokenCounter: TokenCounterUtils,
        contextWindow: ModelContextWindow
    ) {
        // If there is no context window reserved for context.user,
        // context will share the same token budget with chat.
        this.shareChatAndUserBudget = !contextWindow.context?.user
        this.maxChatTokens = contextWindow.input
        this.maxContextTokens = {
            user: contextWindow.context?.user ?? contextWindow.input,
            corpus: Math.floor(contextWindow.input * CORPUS_CONTEXT_ALLOCATION),
        }
    }

    /**
     * Updates the token usage for the messages of a specified token usage type.
     *
     * @param type - The type of token usage to update.
     * @param messages - The messages to calculate the token count for.
     * @returns `true` if the token usage can be allocated, `false` otherwise.
     */
    public updateUsage(
        type: TokenUsageType,
        messages: Message[]
    ): { succeeded: boolean; reason?: string } {
        const count = this.tokenCounter.getMessagesTokenCount(messages)
        const { isWithinLimit, reason } = this.canAllocateTokens(type, count)
        if (isWithinLimit) {
            this.usedTokens[type] = this.usedTokens[type] + count
        }
        return { succeeded: isWithinLimit, reason }
    }

    /**
     * NOTE: Should only be used by @canAllocateTokens to determine if the token usage can be allocated in correct order.
     *
     * Calculates the remaining token budget for each token usage type.
     *
     * @returns The remaining token budget for chat, User-Context, and Enhanced-Context (if applicable).
     */
    private get remainingTokens(): Pick<TokenBudget, 'chat'> & ChatContextTokenUsage {
        const usedChat = this.usedTokens.preamble + this.usedTokens.input
        const usedUser = this.usedTokens.user
        const usedCorpus = this.usedTokens.corpus

        let chat = this.maxChatTokens - usedChat
        let user = this.maxContextTokens.user - usedUser

        // When the context shares the same token budget with Chat...
        if (this.shareChatAndUserBudget) {
            // ...subtracts the tokens used by context from Chat.
            chat -= usedUser + usedCorpus
            // ...the remaining token budget for User-Context is the same as Chat.
            user = chat
        }

        return {
            chat,
            user,
            corpus: Math.floor(chat * CORPUS_CONTEXT_ALLOCATION),
        }
    }

    /**
     * Checks if the specified token usage type has enough remaining tokens to allocate the given count.
     *
     * @param type - The type of token usage to check.
     * @param count - The number of tokens to allocate.
     * @returns `true` if the tokens can be allocated, `false` otherwise.
     */
    private canAllocateTokens(
        type: TokenUsageType,
        count: number
    ): { isWithinLimit: boolean; reason?: string } {
        switch (type) {
            case 'preamble': {
                const isWithinLimit = this.remainingTokens.chat >= count
                return {
                    isWithinLimit,
                    reason: !isWithinLimit
                        ? `preamble tokens exceeded remaining chat tokens (${count} > ${this.remainingTokens.chat})`
                        : undefined,
                }
            }
            case 'input': {
                if (!this.usedTokens.preamble) {
                    throw new Error('Preamble must be updated before Chat input.')
                }
                const isWithinLimit = this.remainingTokens.chat >= count
                return {
                    isWithinLimit,
                    reason: !isWithinLimit
                        ? `input tokens exceeded remaining chat tokens (${count} > ${this.remainingTokens.chat})`
                        : undefined,
                }
            }
            case 'user': {
                if (!this.usedTokens.input) {
                    throw new Error('Chat token usage must be updated before Context.')
                }
                const isWithinLimit = this.remainingTokens.user >= count
                return {
                    isWithinLimit,
                    reason: !isWithinLimit
                        ? `user context tokens exceeded remaining user context tokens (${count} > ${this.remainingTokens.user})`
                        : undefined,
                }
            }
            case 'corpus': {
                if (!this.usedTokens.input) {
                    throw new Error('Chat token usage must be updated before Context.')
                }
                const isWithinLimit = this.remainingTokens.corpus >= count
                return {
                    isWithinLimit,
                    reason: !isWithinLimit
                        ? `corpus context tokens exceeded remaining corpus context tokens (${count} > ${this.remainingTokens.corpus})`
                        : undefined,
                }
            }
            default:
                return {
                    isWithinLimit: false,
                    reason: `unrecognized token usage type ${type}`,
                }
        }
    }
}
