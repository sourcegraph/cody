import { getNewLineChar, lines } from '../completions/text-processing'

import type { DecorationInfo } from './renderer/decorators/base'

export function fixFirstLineIndentation(source: string, target: string): string {
    // Check the first line indentation of source string and replaces in target string.
    const codeToRewriteLines = lines(source)
    const completionLines = lines(target)
    const firstLineMatch = codeToRewriteLines[0].match(/^(\s*)/)
    const firstLineIndentation = firstLineMatch ? firstLineMatch[1] : ''
    completionLines[0] = firstLineIndentation + completionLines[0].trimStart()
    const completion = completionLines.join(getNewLineChar(source))
    return completion
}

/**
 * Split a string into lines, keeping the line endings.
 * @param s - The string to split.
 * @returns An array of lines.
 */
export function splitLinesKeepEnds(s: string): string[] {
    const pattern = /[^\r\n]*(?:\r\n|\n|\r|$)/g
    const lines = s.match(pattern) || []
    if (lines.length > 1 && lines[lines.length - 1] === '') {
        lines.pop()
    }
    return lines
}

export function extractInlineCompletionFromRewrittenCode(
    prediction: string,
    codeToRewritePrefix: string,
    codeToRewriteSuffix: string
): string {
    const predictionWithoutPrefix = prediction.slice(codeToRewritePrefix.length)
    const endIndex = predictionWithoutPrefix.length - codeToRewriteSuffix.length
    const completion = predictionWithoutPrefix.slice(0, endIndex)
    const completionNumLines = lines(completion).length
    const completionWithSameLineSuffix = lines(predictionWithoutPrefix).slice(0, completionNumLines)
    return completionWithSameLineSuffix.join(getNewLineChar(codeToRewritePrefix + codeToRewriteSuffix))
}

export function trimExtraNewLineCharsFromSuggestion(
    predictedText: string,
    codeToRewrite: string
): string {
    const codeToRewriteChars = getNumberOfNewLineCharsAtSuffix(codeToRewrite)
    const predictedTextChars = getNumberOfNewLineCharsAtSuffix(predictedText)
    const extraChars = predictedTextChars - codeToRewriteChars
    if (extraChars <= 0) {
        return predictedText
    }
    return predictedText.slice(0, -extraChars)
}

function getNumberOfNewLineCharsAtSuffix(text: string): number {
    const match = text.match(/\n+$/)
    return match ? match[0].length : 0
}

export function isPredictedTextAlreadyInSuffix({
    codeToRewrite,
    decorationInfo: { addedLines },
    suffix,
}: {
    codeToRewrite: string
    decorationInfo: DecorationInfo
    suffix: string
}): boolean {
    if (addedLines.length === 0) {
        return false
    }

    const allAddedLinesText = addedLines
        .sort((a, b) => a.modifiedLineNumber - b.modifiedLineNumber)
        .map(line => line.text)
        .join(getNewLineChar(codeToRewrite))

    return suffix.length > 0 && suffix.startsWith(allAddedLinesText)
}

/**
 * Adjusts the prediction to enable inline completion when possible.
 *
 * This function attempts to modify the original prediction so that it can be seamlessly inserted
 * inline between the given prefix and suffix. The intent is to extract the relevant completion
 * content from the prediction by identifying where the prefix and suffix appear within it. It ensures
 * that any extra new line characters or unintended content outside the prefix and suffix are handled
 * appropriately to produce a clean inline completion.
 *
 * **High-level methodology:**
 * 1. **Strip New Line Characters:** Remove leading and trailing new line characters from the prefix and suffix to accurately match them within the prediction.
 * 2. **Find Indices:** Locate the indices of the prefix and suffix within the original prediction.
 *    - If either is not found, return the original prediction as adjustment is not possible.
 * 3. **Verify Surrounding Content:** Check that any content before the prefix and after the suffix in the prediction consists only of new line characters.
 *    - If there is other content, return the original prediction to avoid incorrect insertion.
 * 4. **Extract Completion Content:** Slice out the content between the prefix and suffix from the prediction.
 * 5. **Trim Excess New Lines:** Remove any unnecessary new line characters from the start and end of the completion content to align it properly with the surrounding
 */
export function adjustPredictionIfInlineCompletionPossible(
    originalPrediction: string,
    prefix: string,
    suffix: string
): string {
    const prefixWithoutNewLine = trimNewLineCharsFromString(prefix)
    const suffixWithoutNewLine = trimNewLineCharsFromString(suffix)

    const indexPrefix = originalPrediction.indexOf(prefixWithoutNewLine)
    const indexSuffix = originalPrediction.lastIndexOf(suffixWithoutNewLine)
    if (
        indexPrefix === -1 ||
        indexSuffix === -1 ||
        indexPrefix + prefixWithoutNewLine.length > indexSuffix
    ) {
        return originalPrediction
    }

    const predictionBeforePrefixMatch = originalPrediction.slice(0, indexPrefix)
    const predictionAfterSuffixMatch = originalPrediction.slice(
        indexSuffix + suffixWithoutNewLine.length
    )
    if (
        !isAllNewLineChars(predictionBeforePrefixMatch) ||
        !isAllNewLineChars(predictionAfterSuffixMatch)
    ) {
        return originalPrediction
    }

    let completion = originalPrediction.slice(indexPrefix + prefixWithoutNewLine.length, indexSuffix)

    const trimStartChars = Math.min(countNewLineCharsStart(completion), countNewLineCharsEnd(prefix))
    const trimEndChars = Math.min(countNewLineCharsEnd(completion), countNewLineCharsStart(suffix))
    completion = completion.substring(
        trimStartChars,
        Math.max(trimStartChars, completion.length - trimEndChars)
    )
    const prediction = prefix + completion + suffix
    return prediction
}

/**
 * Counts the number of newline characters at the end of a string
 */
export function countNewLineCharsEnd(text: string): number {
    const match = text.match(/(?:\r\n|\n)+$/)
    return match ? match[0].length : 0
}

/**
 * Counts the number of newline characters at the start of a string
 */
export function countNewLineCharsStart(text: string): number {
    const match = text.match(/^(?:\r\n|\n)+/)
    return match ? match[0].length : 0
}

/**
 * Checks if a string consists only of newline characters
 */
export function isAllNewLineChars(text: string): boolean {
    return /^[\r\n]*$/.test(text)
}

/**
 * Removes all newline characters from both the start and end of a string
 */
export function trimNewLineCharsFromString(text: string): string {
    return text.replace(/^(?:\r\n|\n)+|(?:\r\n|\n)+$/g, '')
}

/**
 * Clips a number to a range, ensuring it is within the specified bounds.
 */
export function clip(line: number, min: number, max: number) {
    return Math.max(Math.min(line, max), min)
}
