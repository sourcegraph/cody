export const CHAT_TOKEN_BUDGET = 7000
export const FAST_CHAT_TOKEN_BUDGET = 4096

/**
 * The total context window reserved for user-added context (e.g. @-mention).
 */
export const USER_CONTEXT_TOKEN_BUDGET = 15000

/**
 * Enhanced context should take up 60% of the context window
 */
export const ENHANCED_CONTEXT_ALLOCATION = 0.6
