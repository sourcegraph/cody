import { lines } from '../completions/text-processing'

export function fixFirstLineIndentation(source: string, target: string): string {
    // Check the first line indentation of source string and replaces in target string.
    const codeToRewriteLines = lines(source)
    const completionLines = lines(target)
    const firstLineMatch = codeToRewriteLines[0].match(/^(\s*)/)
    const firstLineIndentation = firstLineMatch ? firstLineMatch[1] : ''
    completionLines[0] = firstLineIndentation + completionLines[0].trimStart()
    const completion = completionLines.join('\n')
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

/**
 * Maps each line in the original list to a new line number based on the given index and mapped value.
 *
 * This function iterates through the original list of lines and calculates a new line number for each line.
 * The calculation is based on the given index and mapped value. For lines before the given index, the new line number
 * is the mapped value minus the difference between the index and the current line number. For lines after the given index,
 * the new line number is the mapped value plus the difference between the current line number and the index. For the line
 * at the given index, the new line number is the mapped value.
 *
 * @param originalList - The original list of lines.
 * @param index - The index to base the mapping on.
 * @param mappedValue - The value to map the lines to.
 * @returns An array of new line numbers corresponding to each line in the original list.
 */
export function mapLinesToOriginalLineNo(
    originalList: string[],
    index: number,
    mappedValue: number
): number[] {
    const result: number[] = []
    for (let i = 0; i < originalList.length; i++) {
        if (i < index) {
            result.push(mappedValue - (index - i))
        } else if (i > index) {
            result.push(mappedValue + (i - index))
        } else {
            result.push(mappedValue)
        }
    }
    return result
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
    return completionWithSameLineSuffix.join('\n')
}

// Helper function to zip two arrays together
export function zip<T, U>(arr1: T[], arr2: U[]): [T, U][] {
    const length = Math.min(arr1.length, arr2.length)
    return Array.from({ length }, (_, i) => [arr1[i], arr2[i]])
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
    if (indexPrefix === -1 || indexSuffix === -1) {
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
export function countNewLineCharsEnd(text: string): number {
    const match = text.match(/\n+$/)
    return match ? match[0].length : 0
}

export function countNewLineCharsStart(text: string): number {
    const match = text.match(/^\n+/)
    return match ? match[0].length : 0
}

export function isAllNewLineChars(text: string): boolean {
    return /^[\n\r]*$/.test(text)
}

export function trimNewLineCharsFromString(text: string): string {
    return text.replace(/^\n+|\n+$/g, '')
}
