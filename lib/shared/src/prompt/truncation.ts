import { ActiveTextEditorSelectionRange } from '../editor'

import { CHARS_PER_TOKEN } from './constants'

/**
 * Truncates text to the given number of tokens, keeping the start of the text.
 */
export function truncateText(text: string, maxTokens: number): string {
    const maxLength = maxTokens * CHARS_PER_TOKEN
    return text.length <= maxLength ? text : text.slice(0, maxLength)
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
): { truncated: string; range?: ActiveTextEditorSelectionRange } {
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
    const maxLength = maxTokens * CHARS_PER_TOKEN
    return text.length <= maxLength ? text : text.slice(-maxLength - 1)
}
