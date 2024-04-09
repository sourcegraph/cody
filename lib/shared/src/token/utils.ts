import { CHARACTERS_PER_TOKEN } from './constants'

/**
 * Calculate the number of characters from the number of tokens.
 */
export function tokensToChars(tokens: number): number {
    return tokens * CHARACTERS_PER_TOKEN
}

/**
 * Calculate the number of token from the number of characters.
 */
export function charsToTokens(characters: number): number {
    return Math.floor(characters / CHARACTERS_PER_TOKEN)
}
