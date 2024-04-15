/**
 * @deprecated This is temporarily preserved for enterprise users as
 * some users are using older OpenAI models that have a combined input/output window.
 *
 * We need to support configuring the maximum output limit at an instance level.
 * This will allow us to increase this limit whilst still supporting models with a lower output limit.
 * See: https://github.com/sourcegraph/cody/issues/3648#issuecomment-2056954101
 */
export const ANSWER_TOKENS = 1000
export const MAX_CURRENT_FILE_TOKENS = 1000
/**
 * A token is equivalent to 4 characters/bytes.
 */
export const CHARS_PER_TOKEN = 4
export const SURROUNDING_LINES = 50
export const NUM_CODE_RESULTS = 12
export const NUM_TEXT_RESULTS = 3

export const MAX_BYTES_PER_FILE = 4096

// CHAT MODEL TOKEN LIMITS
export const DEFAULT_CHAT_MODEL_INPUT_TOKEN_LIMIT = 7000
export const DEFAULT_CHAT_MODEL_OUTPUT_TOKEN_LIMIT = 4000
export const DEFAULT_FAST_MODEL_INPUT_TOKEN_LIMIT = 4096
export const DEFAULT_FAST_MODEL_OUTPUT_TOKEN_LIMIT = 4000

/**
 * Calculate the number of characters from the number of tokens.
 */
export function tokensToChars(tokenCount: number): number {
    return tokenCount * CHARS_PER_TOKEN
}

/**
 * Calculate the number of token from the number of characters.
 */
export function charsToTokens(charsCount: number): number {
    return charsCount / CHARS_PER_TOKEN
}
