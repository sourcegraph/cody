import * as vscode from 'vscode'

import type { CodeToReplaceData } from '@sourcegraph/cody-shared'

import {
    AutoeditStopReason,
    type ModelResponse,
    type PartialModelResponse,
    type SuccessModelResponse,
} from './adapters/base'
import { type PredictionResult, getDecorationInfoFromPrediction } from './autoedits-provider'
import { getDiffChangeBoundaries } from './renderer/diff-utils'

// Number of lines to accumulate before emitting a hot streak suggestion
export const HOT_STREAK_LINES_THRESHOLD = 5

export function isHotStreakResponse(
    response: ModelResponse,
    startedHotStreak = false
): response is SuccessModelResponse | PartialModelResponse {
    if (startedHotStreak) {
        // If we have already started emitted hot-streak suggestions, then we should treat all responses as hot-streaks
        return response.type === 'partial' || response.type === 'success'
    }
    // Otherwise only attempt doing so for partial responses.
    return response.type === 'partial'
}

export async function* processHotStreakResponses(
    responseGenerator: AsyncGenerator<ModelResponse>,
    document: vscode.TextDocument,
    codeToReplaceData: CodeToReplaceData
): AsyncGenerator<PredictionResult> {
    // Track the chunks we've already emitted to adjust future prediction ranges
    let previousChunksLines = 0
    let startedHotStreak = false

    for await (const response of responseGenerator) {
        if (isHotStreakResponse(response, startedHotStreak)) {
            const trimmedPrediction = trimPredictionForHotStreak(
                response.prediction,
                previousChunksLines
            )
            if (!trimmedPrediction) {
                // No complete lines yet, continue
                continue
            }

            const lines = trimmedPrediction.split('\n')
            const currentLineCount = lines.length
            const reachedHotStreakThreshold = currentLineCount > HOT_STREAK_LINES_THRESHOLD
            if (response.type === 'partial' && !reachedHotStreakThreshold) {
                // We haven't reached the hot streak threshold and we still have more lines to process
                // Continue streaming
                continue
            }

            // The default `codeToReplaceData` range is not suitable, as we haven't finished
            // generating the prediction. Instead, we trim this range so it matches the same
            // number of lines as the prediction.
            const adjustedPredictionRange = new vscode.Range(
                codeToReplaceData.range.start.translate(previousChunksLines),
                codeToReplaceData.range.start.translate(previousChunksLines + currentLineCount)
            )

            const diff = getDecorationInfoFromPrediction(
                document,
                trimmedPrediction,
                adjustedPredictionRange
            )

            const diffChangeBoundaries = getDiffChangeBoundaries(diff)
            if (!diffChangeBoundaries) {
                // Diff doesn't have any changes, so we can't emit a hot streak prediction
                continue
            }

            const [firstLineOfDiff, lastLineOfDiff] = diffChangeBoundaries
            const lastChangedLineNumber =
                lastLineOfDiff.type === 'removed'
                    ? lastLineOfDiff.originalLineNumber
                    : lastLineOfDiff.modifiedLineNumber
            if (
                lastChangedLineNumber === adjustedPredictionRange.end.line &&
                lastLineOfDiff.type !== 'unchanged'
            ) {
                // If the last line of the diff is a change, it indicates that the prediction is not complete.
                continue
            }

            // We determine the next cursor position by using the first changed line of the diff.
            // This can be used so that the user can "jump" to this suggestion and immediately understand what is being changed.
            const nextCursorLine =
                firstLineOfDiff.type === 'removed'
                    ? firstLineOfDiff.originalLineNumber
                    : firstLineOfDiff.modifiedLineNumber
            const nextCursorPosition = document.lineAt(nextCursorLine).range.end

            // Track how many lines we've processed so far for future chunks
            previousChunksLines = currentLineCount - 1
            // Mark that we've started a hot streak
            startedHotStreak = true

            yield {
                response: {
                    ...response,
                    prediction: trimmedPrediction, // Use the trimmed prediction
                    stopReason: AutoeditStopReason.HotStreak,
                },
                adjustedPredictionRange,
                nextCursorPosition,
            }
        }

        // Pass through all other response types unchanged
        yield { response }
    }
}

/**
 * Trims a prediction string to the last complete line
 * @param prediction The streamed prediction that might end mid-line
 * @returns The prediction trimmed to the last complete line
 */
function trimPredictionForHotStreak(prediction: string, previousChunksLines: number): string {
    // If the prediction is empty, return it as is
    if (!prediction) {
        return prediction
    }

    const lines = prediction.split('\n')
    const suffixTrimmedPrediction = lines.slice(previousChunksLines).join('\n')
    console.log('DEBUG TRIMMING', {
        prediction,
        previousChunksLines,
        suffixTrimmedPrediction,
    })

    // If the prediction ends with a newline, it's already complete
    if (suffixTrimmedPrediction.endsWith('\n')) {
        return suffixTrimmedPrediction
    }

    // Find the last newline character
    const lastNewlineIndex = suffixTrimmedPrediction.lastIndexOf('\n')

    // If there's no newline, we can't trim to a complete line
    if (lastNewlineIndex === -1) {
        return ''
    }

    // Return everything up to and including the last newline
    return suffixTrimmedPrediction.substring(0, lastNewlineIndex + 1)
}
