import type { RangeData } from '../common/range'
import { TokenCounter } from '../token/counter'

import type { PromptString } from './prompt-string'

/**
 * Truncates text to the given number of tokens, keeping the start of the text.
 */
export function truncateText(text: string, maxTokens: number): string {
    const encoded = TokenCounter.encode(text)
    return encoded.length <= maxTokens ? text : TokenCounter.decode(encoded.slice(0, maxTokens)).trim()
}

export function truncatePromptString(text: PromptString, maxTokens: number): PromptString {
    const encoded = TokenCounter.encode(text.toString())
    return encoded.length <= maxTokens
        ? text
        : text.slice(0, TokenCounter.decode(encoded.slice(0, maxTokens))?.length).trim()
}

/**
 * If text was truncated, return the truncated text and range to which it was truncated.
 * If the text is shorter than maxBytes, then return the text as-is with an undefined
 * range.
 * Note: the truncated text and range may be empty (e.g., for single-line files,
 * which should be ignored anyway).
 */
export function truncateTextNearestLine(
    text: string,
    maxBytes: number
): { truncated: string; range?: RangeData } {
    if (text.length <= maxBytes) {
        return { truncated: text }
    }
    const textMaxBytes = text.slice(0, maxBytes)
    const textMaxBytesLines = textMaxBytes.split('\n')
    if (text.at(maxBytes) === '\n' || text.at(maxBytes - 1) === '\n') {
        return {
            truncated: textMaxBytes,
            range: {
                start: { line: 0, character: 0 },
                end: { line: textMaxBytesLines.length, character: 0 },
            },
        }
    }

    const truncated = textMaxBytesLines.slice(0, -1).join('\n')
    return {
        truncated,
        range: {
            start: { line: 0, character: 0 },
            end: { line: textMaxBytesLines.length - 1, character: 0 },
        },
    }
}

/**
 * Truncates text to the given number of tokens, keeping the end of the text.
 */
export function truncateTextStart(text: string, maxTokens: number): string {
    const encoded = TokenCounter.encode(text)
    return encoded.length <= maxTokens ? text : TokenCounter.decode(encoded.slice(-maxTokens)).trim()
}

export function truncatePromptStringStart(text: PromptString, maxTokens: number): PromptString {
    const encoded = TokenCounter.encode(text.toString())

    if (encoded.length <= maxTokens) {
        return text
    }

    // We can not create a PromptString from the tokens directly as this would be
    // considered unsafe. Instead, we use the string representation to get the updated
    // character count

    const decoded = TokenCounter.decode(encoded.slice(-maxTokens))
    return text.slice(-decoded.length - 1).trim()
}
