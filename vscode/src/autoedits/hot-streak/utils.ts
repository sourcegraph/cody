import * as vscode from 'vscode'

function trimPredictionToLastFullLine(prediction: string): string {
    if (!prediction) {
        return prediction
    }

    // If the prediction ends with a newline, it's already complete
    if (prediction.endsWith('\n')) {
        return prediction
    }

    const lastNewlineIndex = prediction.lastIndexOf('\n')
    if (lastNewlineIndex === -1) {
        // If there's no newline, we can't trim to a complete line
        return ''
    }

    // Return everything up to and including the last newline
    return prediction.substring(0, lastNewlineIndex + 1)
}

function trimProcessedTextFromPrediction(
    prediction: string,
    previousChunksLines: number
): [string, string] {
    // If the prediction is empty, return it as is
    if (!prediction) {
        return ['', prediction]
    }

    const lines = prediction.split('\n')
    const prefix = lines.slice(0, previousChunksLines).join('\n')
    const remainingPrediction = lines.slice(previousChunksLines).join('\n')
    return [prefix, remainingPrediction]
}

export function trimPredictionForHotStreak({
    fullPrediction,
    fullPredictionRange,
    processedPredictionLines,
}: {
    fullPrediction: string
    fullPredictionRange: vscode.Range
    processedPredictionLines: number
}): {
    processedPrediction: string
    processedPredictionRange: vscode.Range
    remainingPrediction: string
    remainingPredictionRange: vscode.Range
} {
    const trimmedPrediction = trimPredictionToLastFullLine(fullPrediction)
    const [processedPrediction, remainingPrediction] = trimProcessedTextFromPrediction(
        trimmedPrediction,
        processedPredictionLines
    )

    const chunkLineCount = remainingPrediction.split('\n').length - 1 // excluding the final new line
    const processedPredictionRange = new vscode.Range(
        fullPredictionRange.start,
        fullPredictionRange.start.translate(processedPredictionLines)
    )

    // We need to adjust the prediction range to match the prediction so far.
    // This ensures we don't diff the partial prediction against the full codeToRewrite
    const remainingPredictionRange = new vscode.Range(
        processedPredictionRange.end,
        fullPredictionRange.start.translate(processedPredictionLines + chunkLineCount)
    )

    return {
        processedPrediction,
        processedPredictionRange,
        remainingPrediction,
        remainingPredictionRange,
    }
}
