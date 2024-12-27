import { getNewLineChar, lines } from '../completions/text-processing'

import type { CodeToReplaceData } from './prompt/prompt-utils'

/**
 * Shrinks the prediction by removing overlapping lines with the suffix.
 */
export function shrinkPredictionUntilSuffix({
    prediction,
    codeToReplaceData: { suffixInArea, suffixAfterArea, codeToRewrite },
}: {
    prediction: string
    codeToReplaceData: CodeToReplaceData
}): string {
    if (prediction.length === 0) {
        return prediction
    }

    const newLineChar = getNewLineChar(codeToRewrite)
    const suffix = suffixInArea + suffixAfterArea

    // Remove the last empty line from the prediction because it always ends
    // with an extra empty line. This extra line is technically the first line
    // of the suffix. Stripping it ensures we can accurately compare the last
    // lines of the prediction to the first lines of the suffix.
    const predictionWithoutLastEmptyLine = prediction.endsWith(newLineChar)
        ? prediction.slice(0, -newLineChar.length)
        : prediction

    const predictionLines = lines(predictionWithoutLastEmptyLine)
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
            // Using a partial match predictionSlice[j].startWith(suffixSlice[j] here
            // gives us too many false positive, so if we encounter cases where the model
            // suggests modified suffix lines, we should address it on a different stage.
            if (predictionSlice[j] !== suffixSlice[j]) {
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
