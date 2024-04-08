import { BYTES_PER_TOKEN } from './constants'

/**
 * Calculate the number of characters from the number of tokens.
 */
export function tokensToBytes(tokens: number): number {
    return tokens * BYTES_PER_TOKEN
}

/**
 * Calculate the number of token from the number of characters.
 */
export function bytesToTokens(bytes: number): number {
    return bytes / BYTES_PER_TOKEN
}
