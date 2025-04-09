import type { CodeToReplaceData, DocumentContext } from '@sourcegraph/cody-shared'
import * as uui from 'uuid'
import { TextDocument } from 'vscode-languageserver-textdocument'

import type * as vscode from 'vscode'

import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { wrapVSCodeTextDocument } from '../../editor/utils/virtual-text-document'
import { AutoeditStopReason, type ModelResponse } from '../adapters/base'
import type { AutoeditHotStreakID } from '../analytics-logger'
import { autoeditsProviderConfig } from '../autoedits-config'
import {
    type AbortedPredictionResult,
    type SuggestedPredictionResult,
    getDecorationInfoFromPrediction,
} from '../autoedits-provider'
import { getCodeToReplaceData } from '../prompt/prompt-utils'
import { getDiffChangeBoundaries } from '../renderer/diff-utils'
import { trimPredictionForHotStreak } from './utils'

/**
 * Number of lines that should be accumulated before attempting a hot streak suggestion.
 * Note: Reaching this number does not guarantee a hot streak suggestion will be emitted.
 * The suggestion should also produce a valid diff that is suitable to be chunked.
 */
export const HOT_STREAK_LINES_THRESHOLD = 5

/**
 * Process a stream of model responses and attempt to emit a "hot-streak" suggestion.
 * A hot-streak is where we emit suggestions before the model is done generating.
 * This allows us to use a large rewrite window whilst still achieving low latency responses.
 */
export async function* processHotStreakResponses(
    responseGenerator: AsyncGenerator<ModelResponse>,
    document: vscode.TextDocument,
    codeToReplaceData: CodeToReplaceData,
    docContext: DocumentContext,
    position: vscode.Position
): AsyncGenerator<Omit<SuggestedPredictionResult, 'cacheId'> | AbortedPredictionResult> {
    let processedPredictionLines = 0
    let hotStreakId = null

    for await (const response of responseGenerator) {
        const shouldHotStreak = hotStreakId
            ? // If we have already started emitted hot-streak suggestions, then we should treat all responses as hot-streaks
              response.type === 'partial' || response.type === 'success'
            : // Otherwise only attempt doing so for partial responses.
              response.type === 'partial'

        if (shouldHotStreak && response.type !== 'aborted') {
            const {
                processedPrediction,
                processedPredictionRange,
                remainingPrediction,
                remainingPredictionRange,
            } = trimPredictionForHotStreak({
                fullPrediction: response.prediction,
                fullPredictionRange: codeToReplaceData.range,
                processedPredictionLines: processedPredictionLines,
            })

            if (!remainingPrediction) {
                // No complete lines yet, continue
                continue
            }

            const currentLineCount = remainingPrediction.split('\n').length - 1 // excluding the final new line
            const reachedHotStreakThreshold = currentLineCount > HOT_STREAK_LINES_THRESHOLD
            if (response.type === 'partial' && !reachedHotStreakThreshold) {
                // We haven't reached the hot streak threshold and we still have more lines to process
                // Continue streaming
                continue
            }

            const diff = getDecorationInfoFromPrediction(
                document,
                remainingPrediction,
                remainingPredictionRange
            )

            // We want: start line of the diff (first edit/cursor position)
            // end line of the diff - used to determine if we can chunk the diff
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
                response.type === 'partial' &&
                lastLineOfDiff.type !== 'unchanged' &&
                lastLineNumberOfDiff === remainingPredictionRange.end.line
            ) {
                // We only emit a hot streak prediction when the final line of the prediction range is unchanged.
                // This ensures that the diff is appropriately chunked.
                // Example: If the last line of the range was removed, it may be that the LLM is actually replacing
                // this line with another one in the next chunk.
                // TODO: Add tests for this
                continue
            }

            if (!hotStreakId) {
                // We are emitting a hot streak prediction. This means that all future response should be treated as hot streaks.
                hotStreakId = uui.v4() as AutoeditHotStreakID
            }

            let documentSnapshot = document
            if (processedPrediction.length !== 0) {
                const mutableDocument = TextDocument.create(
                    document.uri.toString(),
                    document.languageId,
                    document.version,
                    document.getText()
                )

                // The hot streak suggestion excludes part of the full prediction. This means that it fundamentally relies
                // on the processed part of the prediction existing in the document to be a valid suggestion.
                // We need to update the document to reflect this, so that later docContext and codeToReplaceData
                // are accurate.
                TextDocument.update(
                    mutableDocument,
                    [{ range: processedPredictionRange, text: processedPrediction }],
                    document.version + 1
                )
                documentSnapshot = wrapVSCodeTextDocument(mutableDocument)
            }

            // The hot streak prediction excludes part of the prefix. This means that it fundamentally relies
            // on the prefix existing in the document to be a valid suggestion. We need to update the docContext
            // to reflect this.
            const updatedDocContext = getCurrentDocContext({
                document: documentSnapshot,
                position: remainingPredictionRange.start,
                maxPrefixLength: docContext.maxPrefixLength,
                maxSuffixLength: docContext.maxSuffixLength,
            })

            const adjustedCodeToReplace = getCodeToReplaceData({
                docContext: updatedDocContext,
                document: documentSnapshot,
                position: remainingPredictionRange.start,
                tokenBudget: {
                    ...autoeditsProviderConfig.tokenLimit,
                    codeToRewritePrefixLines: 0,
                    codeToRewriteSuffixLines: currentLineCount - 1,
                },
            })

            const firstLineNumberOfDiff =
                firstLineOfDiff.type === 'removed'
                    ? firstLineOfDiff.originalLineNumber
                    : firstLineOfDiff.modifiedLineNumber

            // We use the first line of the diff as the next cursor position.
            // This is useful so that we can support "jumping" to this suggestion from a different part of the document
            const editPosition = documentSnapshot.lineAt(firstLineNumberOfDiff).range.end

            // Track the number of lines we have processed, this is used to trim the prediction accordingly in the next response.
            processedPredictionLines = processedPredictionLines + currentLineCount

            yield {
                type: 'suggested',
                response: {
                    ...response,
                    prediction: remainingPrediction,
                    stopReason: AutoeditStopReason.HotStreak,
                },
                uri: documentSnapshot.uri.toString(),
                editPosition,
                docContext: updatedDocContext,
                codeToReplaceData: adjustedCodeToReplace,
                hotStreakId,
            }
            continue
        }

        // No hot-streak, yield responses
        if (response.type === 'aborted') {
            // No hot-streak, yield response.
            yield { type: 'aborted', response }
            return
        }

        const diff = getDecorationInfoFromPrediction(
            document,
            response.prediction,
            codeToReplaceData.range
        )

        const diffChangeBoundaries = getDiffChangeBoundaries(diff)
        if (!diffChangeBoundaries) {
            // This is the final response (no hot-streak) and we have no diff.
            // We will yield a suggestion but it will be handled downstream and will not be shown to the user.
            yield {
                type: 'suggested',
                response,
                uri: document.uri.toString(),
                editPosition: position,
                docContext,
                codeToReplaceData,
            }
            // Diff doesn't have any changes, so we can't emit a hot streak prediction
            continue
        }

        const [firstLineOfDiff] = diffChangeBoundaries
        const firstLineNumberOfDiff =
            firstLineOfDiff.type === 'removed'
                ? firstLineOfDiff.originalLineNumber
                : firstLineOfDiff.modifiedLineNumber
        const editPosition = document.lineAt(firstLineNumberOfDiff).range.end

        yield {
            type: 'suggested',
            response,
            uri: document.uri.toString(),
            docContext,
            codeToReplaceData,
            // Note that an `editPosition` is returned here regardless of whether the suggestion is a hot-streak.
            // This is so this can still be used as a "next cursor" prediction source for a scenario where we have
            // a long rewrite window but the only change is at the bottom, far away from the users' cursor.
            // In these scenarios we should show a next cursor suggestion instead of the code suggestion.
            editPosition,
        }
    }
}
