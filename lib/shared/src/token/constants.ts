/**
 * The default context window for chat models that are NOT Claude-3 Sonnet or Opus.
 */
export const CHAT_INPUT_TOKEN_BUDGET = 7000

/**
 * The default context window for fast chat models with a smaller context window.
 */
export const FAST_CHAT_INPUT_TOKEN_BUDGET = 4096

/**
 * The default output token limit for chat models.
 */
export const CHAT_OUTPUT_TOKEN_BUDGET = 4000

/**
 * Corpus context takes up to 60% of the total context window for chat.
 * The % is the same for both fast and regular chat models.
 */
export const CORPUS_CONTEXT_ALLOCATION = 0.6

/**
 * NOTE: Reserved for models with large context windows and good recall.
 *
 * The total context window reserved for user added context (@-mention, right-click, etc.)
 */
export const EXTENDED_USER_CONTEXT_TOKEN_BUDGET = 30000

/**
 * NOTE: Reserved for models with large context windows and good recall.
 *
 * The total context window reserved for chat input.
 */
export const EXTENDED_CHAT_INPUT_TOKEN_BUDGET = 15000
