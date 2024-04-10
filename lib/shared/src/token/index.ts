export interface TokenBudget {
    chat: number
    context: ChatContextTokenUsage
}

export interface ChatMessageTokenUsage {
    chat: number
}

export interface ChatContextTokenUsage {
    user: number
    enhanced: number
}

export type TokenUsageType = 'chat' | ContextTokenUsageType
export type ContextTokenUsageType = 'user' | 'enhanced'
