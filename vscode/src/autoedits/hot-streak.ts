import type { CodeToReplaceData, DocumentContext } from '@sourcegraph/cody-shared'
import * as uui from 'uuid'

import * as vscode from 'vscode'

import { getDocContextAfterRewrite } from '../completions/get-current-doc-context'
import {
    AutoeditStopReason,
    type ModelResponse,
    type PartialModelResponse,
    type SuccessModelResponse,
} from './adapters/base'
import type { AutoeditHotStreakID } from './analytics-logger'
import { autoeditsProviderConfig } from './autoedits-config'
import { type PredictionResult, getDecorationInfoFromPrediction } from './autoedits-provider'
import { getCodeToReplace } from './prompt/prompt-utils'
import { getDiffChangeBoundaries } from './renderer/diff-utils'

/**
 * Number of lines that should be accumulated before attempting a hot streak suggestion.
 * Note: Reaching this number does not guarantee a hot streak suggestion will be emitted.
 * The suggestion should also produce a valid diff that is suitable to be chunked.
 */
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
    codeToReplaceData: CodeToReplaceData,
    docContext: DocumentContext,
    position: vscode.Position
): AsyncGenerator<PredictionResult> {
    let linesAlreadyChunked = 0
    let hotStreakID = null

    for await (const response of responseGenerator) {
        const shouldHotStreak = hotStreakID
            ? // If we have already started emitted hot-streak suggestions, then we should treat all responses as hot-streaks
              response.type === 'partial' || response.type === 'success'
            : // Otherwise only attempt doing so for partial responses.
              response.type === 'partial'

        if (shouldHotStreak && response.type !== 'aborted') {
            const lineTrimmedPrediction = trimPredictionToLastFullLine(
                response.prediction,
                linesAlreadyChunked
            )
            const [prefix, trimmedPrediction] = trimProcessedTextFromPrediction(
                lineTrimmedPrediction,
                linesAlreadyChunked
            )

            if (!trimmedPrediction) {
                // No complete lines yet, continue
                continue
            }

            const lines = trimmedPrediction.split('\n')
            const currentLineCount = lines.length - 1 // excluding the final new line
            const reachedHotStreakThreshold = currentLineCount > HOT_STREAK_LINES_THRESHOLD
            if (response.type === 'partial' && !reachedHotStreakThreshold) {
                // We haven't reached the hot streak threshold and we still have more lines to process
                // Continue streaming
                continue
            }

            // We need to adjust the prediction range to match the prediction so far.
            // This ensures we don't diff the partial prediction against the full codeToRewrite
            const adjustedPredictionRange = new vscode.Range(
                // Hack to fix the off-by-one error. Needs proper fixing
                codeToReplaceData.range.start.translate(
                    linesAlreadyChunked,
                    linesAlreadyChunked > 0 ? 1 : 0
                ),
                codeToReplaceData.range.start.translate(linesAlreadyChunked + currentLineCount)
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
            const lastLineNumberOfDiff =
                lastLineOfDiff.type === 'removed'
                    ? lastLineOfDiff.originalLineNumber
                    : lastLineOfDiff.modifiedLineNumber
            if (
                lastLineOfDiff.type !== 'unchanged' &&
                lastLineNumberOfDiff === adjustedPredictionRange.end.line
            ) {
                // We only emit a hot streak prediction when the final line of the prediction range is unchanged.
                // This ensures that the diff is appropriately chunked.
                // Example: If the last line of the range was removed, it may be that the LLM is actually replacing
                // this line with another one in the next chunk.
                // TODO: Add tests for this
                continue
            }

            if (!hotStreakID) {
                // We are emitting a hot streak prediction. This means that all future response should be treated as hot streaks.
                hotStreakID = uui.v4() as AutoeditHotStreakID
            }

            const prefixRange = new vscode.Range(
                codeToReplaceData.range.start,
                adjustedPredictionRange.start
            )

            // The hot streak prediction excludes part of the prefix. This means that it fundamentally relies
            // on the prefix existing in the document to be a valid suggestion. We need to update the docContext
            // to reflect this.
            const updatedDocContext = getDocContextAfterRewrite({
                document,
                position,
                rewriteRange: prefixRange,
                rewrittenCode: prefix,
                maxPrefixLength: docContext.maxPrefixLength,
                maxSuffixLength: docContext.maxSuffixLength,
            })

            const adjustedCodeToReplace = getCodeToReplace({
                docContext,
                document,
                position: adjustedPredictionRange.start,
                tokenBudget: {
                    ...autoeditsProviderConfig.tokenLimit,
                    codeToRewriteSuffixLines: currentLineCount - 1,
                },
            }).data

            const firstLineNumberOfDiff =
                firstLineOfDiff.type === 'removed'
                    ? firstLineOfDiff.originalLineNumber
                    : firstLineOfDiff.modifiedLineNumber

            // We use the first line of the diff as the next cursor position.
            // This is useful so that we can support "jumping" to this suggestion from a different part of the document
            const editPosition = document.lineAt(firstLineNumberOfDiff).range.end

            // Track the number of lines we have processed, this is used to trim the prediction accordingly in the next response.
            linesAlreadyChunked = linesAlreadyChunked + currentLineCount

            yield {
                response: {
                    ...response,
                    prediction: trimmedPrediction,
                    stopReason: AutoeditStopReason.HotStreak,
                },
                hotStreak: {
                    id: hotStreakID,
                    range: adjustedPredictionRange,
                    cursorPosition: editPosition,
                    docContext: updatedDocContext,
                    codeToReplaceData: adjustedCodeToReplace,
                },
            }
        }

        yield { response }
        // This is useful so that we can support "jumping" to this suggestion from a different part of the document.
    }
}

/**
 * Trims a prediction string to the last complete line
 * @param prediction The streamed prediction that might end mid-line
 * @returns The prediction trimmed to the last complete line
 */
function trimPredictionToLastFullLine(prediction: string, previousChunksLines: number): string {
    // If the prediction is empty, return it as is
    if (!prediction) {
        return prediction
    }

    // If the prediction ends with a newline, it's already complete
    if (prediction.endsWith('\n')) {
        return prediction
    }

    // Find the last newline character
    const lastNewlineIndex = prediction.lastIndexOf('\n')

    // If there's no newline, we can't trim to a complete line
    if (lastNewlineIndex === -1) {
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
