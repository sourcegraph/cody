import { tokensToBytes } from './utils'

export const BYTES_PER_TOKEN = 4

export const CHAT_TOKEN_BUDGET = 7000
export const FAST_CHAT_TOKEN_BUDGET = 4096

/**
 * The total context window reserved for user-added context (e.g. @-mention).
 */
export const USER_CONTEXT_TOKEN_BUDGET = 15000
export const USER_CONTEXT_TOKEN_BUDGET_IN_BYTES = tokensToBytes(USER_CONTEXT_TOKEN_BUDGET)

/**
 * Enhanced context should take up 60% of the context window
 */
export const ENHANCED_CONTEXT_ALLOCATION = 0.6
