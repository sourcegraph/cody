import { getNewLineChar, lines } from '../completions/text-processing'

import type { CodeToReplaceData } from './prompt/prompt-utils'

/**
 * Shrinks the prediction by removing overlapping lines with the suffix.
 * If the prediction becomes smaller than the original code to replace,
 * appends the missing original lines to maintain the line count.
 */
export function shrinkPredictionUntilSuffix(
    prediction: string,
    codeToReplaceData: CodeToReplaceData
): string {
    // Combine the suffixInArea and suffixAfterArea to get the full suffix
    const newLineChar = getNewLineChar(prediction)
    const suffix = codeToReplaceData.suffixInArea + codeToReplaceData.suffixAfterArea

    // Split the prediction and suffix into arrays of lines
    const predictionLines = lines(prediction)
    const suffixLines = lines(suffix)
    const originalLines = lines(codeToReplaceData.codeToRewrite.trimEnd())

    // Determine the maximum possible overlap
    const maxOverlap = Math.min(predictionLines.length, suffixLines.length)
    let overlap = 0

    // Iterate over possible overlap lengths
    for (let i = 1; i <= maxOverlap; i++) {
        // Get the last 'i' lines of the prediction
        const predictionSlice = predictionLines.slice(-i)
        // Get the first 'i' lines of the suffix
        const suffixSlice = suffixLines.slice(0, i)

        // Assume the lines match until proven otherwise
        let matches = true
        for (let j = 0; j < i; j++) {
            // Compare lines after trimming whitespace
            if (!suffixSlice[j].trim().startsWith(predictionSlice[j].trim())) {
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

    const originalLineCount = originalLines.length
    const adjustedPredictionLineCount = predictionLines.length

    // If the prediction has fewer lines than the original, append missing original lines
    if (adjustedPredictionLineCount < originalLineCount) {
        const missingLineCount = originalLineCount - adjustedPredictionLineCount
        const linesToAppend = originalLines.slice(0, missingLineCount)
        predictionLines.push(...linesToAppend)
    }

    // Return the final adjusted prediction
    return predictionLines.join(newLineChar) + newLineChar
}
