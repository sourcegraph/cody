import type { RangeData } from '../common/range'
import { type TokenCounterUtils, getTokenCounterUtils } from '../token/counter'

import type { PromptString } from './prompt-string'

export function truncatePromptString(
    text: PromptString,
    maxTokens: number,
    utils: TokenCounterUtils
): PromptString
export function truncatePromptString(
    text: PromptString,
    maxTokens: number,
    utils?: never
): Promise<PromptString>
export function truncatePromptString(text: PromptString, maxTokens: number, utils?: TokenCounterUtils) {
    const exec = (rutils: TokenCounterUtils) => {
        const encoded = rutils.encode(text.toString())
        return encoded.length <= maxTokens
            ? text
            : text.slice(0, rutils.decode(encoded.slice(0, maxTokens))?.length).trim()
    }

    if (utils) {
        return exec(utils)
    }

    return getTokenCounterUtils().then(exec)
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
export async function truncateTextStart(text: string, maxTokens: number): Promise<string> {
    const tokenCounterUtils = await getTokenCounterUtils()
    const encoded = tokenCounterUtils.encode(text)
    return encoded.length <= maxTokens
        ? text
        : tokenCounterUtils.decode(encoded.slice(-maxTokens)).trim()
}

export async function truncatePromptStringStart(
    text: PromptString,
    maxTokens: number
): Promise<PromptString> {
    const tokenCounterUtils = await getTokenCounterUtils()

    const encoded = tokenCounterUtils.encode(text.toString())

    if (encoded.length <= maxTokens) {
        return text
    }

    // We can not create a PromptString from the tokens directly as this would be
    // considered unsafe. Instead, we use the string representation to get the updated
    // character count

    const decoded = tokenCounterUtils.decode(encoded.slice(-maxTokens))
    return text.slice(-decoded.length - 1).trim()
}
