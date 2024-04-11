/**
 * The default context window for regular chat models.
 */
export const CHAT_TOKEN_BUDGET = 7000

/**
 * The default context window for fast chat models with a smaller context window.
 */
export const FAST_CHAT_TOKEN_BUDGET = 4096

/**
 * Enhanced context takes up to 60% of the total context window for chat.
 * The % is the same for both fast and regular chat models.
 */
export const ENHANCED_CONTEXT_ALLOCATION = 0.6

/**
 * The total context window reserved for user-added context.
 * e.g. @-mention, right-click, etc.
 * NOTE: This is only being used for Claude-3 Sonnet and Opus.
 * For those models, this is added on top of the chat context window.
 * For other models, this number is not used. Instead, they will share
 * the token budget for user-context with the chat context window.
 */
export const USER_CONTEXT_TOKEN_BUDGET = 15000
