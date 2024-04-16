export interface TokenBudget {
    /**
     * Tokens reserved for chat messages, including preamble and user input.
     */
    chat: number
    /**
     * Tokens reserved for context messages.
     */
    context: ChatContextTokenUsage
}

export interface ChatContextTokenUsage {
    /**
     * Tokens used by user-added context messages.
     */
    user: number
    /**
     * Tokens used by non-user-specified context messages.
     */
    enhanced: number
}

export interface TokenUsage extends ChatContextTokenUsage {
    /**
     * Tokens used by the preamble messages.
     */
    preamble: number
    /**
     * Tokens used by the chat input messages.
     */
    input: number
}

export type TokenUsageType = ChatTokenUsageType | ContextTokenUsageType
export type ChatTokenUsageType = 'preamble' | 'input'
export type ContextTokenUsageType = 'user' | 'enhanced'
