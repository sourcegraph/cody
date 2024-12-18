import { getNewLineChar, lines } from '../completions/text-processing'

import type { CodeToReplaceData } from './prompt/prompt-utils'

/**
 * Shrinks the prediction by removing overlapping lines with the suffix.
 */
export function shrinkPredictionUntilSuffix(
    prediction: string,
    codeToReplaceData: CodeToReplaceData
): string {
    // Combine the suffixInArea and suffixAfterArea to get the full suffix
    const newLineChar = getNewLineChar(prediction)
    const suffix = codeToReplaceData.suffixInArea + codeToReplaceData.suffixAfterArea

    // Split the prediction and suffix into arrays of lines
    const predictionLines = lines(stripLastEmptyLineIfExists(prediction))
    const suffixLines = lines(suffix)

    // Determine the maximum possible overlap
    const maxOverlap = Math.min(predictionLines.length, suffixLines.length)
    let overlap = 0

    // Iterate over possible overlap lengths
    for (let i = 1; i <= maxOverlap; i++) {
        const predictionSlice = predictionLines.slice(-i)
        const suffixSlice = suffixLines.slice(0, i)

        // Assume the lines match until proven otherwise
        let matches = true
        for (let j = 0; j < i; j++) {
            if (
                (suffixSlice[j].length > 0 && !predictionSlice[j].startsWith(suffixSlice[j])) ||
                (suffixSlice[j].length === 0 && suffixSlice !== predictionSlice)
            ) {
                matches = false
                break
            }
        }

        // Update the overlap if a match is found
        if (matches) {
            overlap = i
        }
    }

    // If overlap is found, remove the overlapping lines from the prediction
    if (overlap > 0) {
        predictionLines.splice(-overlap, overlap)
    }

    return predictionLines.join(newLineChar) + newLineChar
}

function stripLastEmptyLineIfExists(value: string) {
    const newLineChar = getNewLineChar(value)
    return value.endsWith(newLineChar) ? value.slice(0, -newLineChar.length) : value
}
