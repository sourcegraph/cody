import type { CodeToReplaceData, DocumentContext } from '@sourcegraph/cody-shared'
import * as uui from 'uuid'

import type * as vscode from 'vscode'

import { AutoeditStopReason, type ModelResponse } from '../adapters/base'
import type { AutoeditHotStreakID } from '../analytics-logger'
import type { AbortedPredictionResult, SuggestedPredictionResult } from '../autoedits-provider'
import { getSuggestedDiffForChunk } from './utils/suggested-diff'
import { trimPredictionForHotStreak } from './utils/trim-prediction'

/**
 * Number of lines that should be accumulated before attempting a hot streak suggestion.
 * Note: Reaching this number does not guarantee a hot streak suggestion will be emitted.
 * The suggestion should also produce a valid diff that is suitable to be chunked.
 */
export const HOT_STREAK_LINES_THRESHOLD = 5

export interface ProcessHotStreakResponsesParams {
    responseGenerator: AsyncGenerator<ModelResponse>
    document: vscode.TextDocument
    codeToReplaceData: CodeToReplaceData
    docContext: DocumentContext
    position: vscode.Position
    options: {
        // If hot-streak is actually enabled. If it is not, we will not attempt to emit
        // any hot-streak suggestions and wait for the final response.
        hotStreakEnabled?: boolean
    }
}

/**
 * Process a stream of model responses and attempt to emit a "hot-streak" suggestion.
 * A hot-streak is where we emit suggestions before the model is done generating.
 * This allows us to use a large rewrite window whilst still achieving low latency responses.
 */
export async function* processHotStreakResponses({
    responseGenerator,
    document,
    codeToReplaceData,
    docContext,
    position,
    options,
}: ProcessHotStreakResponsesParams): AsyncGenerator<
    Omit<SuggestedPredictionResult, 'cacheId'> | AbortedPredictionResult
> {
    let processedPrediction = ''
    let hotStreakId = null

    for await (const response of responseGenerator) {
        const canHotStreak = hotStreakId
            ? // If we have already started emitted hot-streak suggestions, then we should treat all responses as hot-streaks
              response.type === 'partial' || response.type === 'success'
            : // Otherwise only attempt doing so for partial responses.
              response.type === 'partial'

        if (options.hotStreakEnabled && canHotStreak && response.type !== 'aborted') {
            const predictionChunk = trimPredictionForHotStreak({
                latestFullPrediction: response.prediction,
                processedPrediction,
                document,
                docContext,
                position,
                codeToReplaceData,
                response,
            })

            if (!predictionChunk) {
                // No complete lines yet, continue
                continue
            }

            const currentLineCount = predictionChunk.text.split('\n').length - 1 // excluding the final new line
            const reachedHotStreakThreshold = currentLineCount > HOT_STREAK_LINES_THRESHOLD
            if (response.type === 'partial' && !reachedHotStreakThreshold) {
                // We haven't reached the hot streak threshold and we still have more lines to process
                // Continue streaming
                continue
            }

            const suggestedDiff = getSuggestedDiffForChunk(response, predictionChunk)
            if (!suggestedDiff) {
                // We can't suggest this diff, keep streaming and try again with the next response
                continue
            }

            if (!hotStreakId) {
                // We are emitting a hot streak prediction. This means that all future response should be treated as hot streaks.
                hotStreakId = uui.v4() as AutoeditHotStreakID
            }

            // We use the first line of the diff as the next cursor position.
            // This is useful so that we can support "jumping" to this suggestion from a different part of the document
            const editPosition = predictionChunk.documentSnapshot.lineAt(
                suggestedDiff.firstChange.lineNumber
            ).range.end

            // Track the number of lines we have processed, this is used to trim the prediction accordingly in the next response.
            processedPrediction = processedPrediction + predictionChunk.text

            yield {
                type: 'suggested',
                response: {
                    ...response,
                    prediction: predictionChunk.text,
                    stopReason: AutoeditStopReason.HotStreak,
                },
                uri: predictionChunk.documentSnapshot.uri.toString(),
                editPosition,
                docContext: predictionChunk.docContext,
                codeToReplaceData: predictionChunk.codeToReplaceData,
                hotStreakId,
            }
            continue
        }

        if (response.type === 'partial') {
            // No hot-streak for this partial response, keep streaming
            continue
        }

        // No hot-streak, yield responses
        if (response.type === 'aborted') {
            // No hot-streak, yield response.
            yield { type: 'aborted', response }
            return
        }

        const suggestedDiff = getSuggestedDiffForChunk(response, {
            documentSnapshot: document,
            text: response.prediction,
            range: codeToReplaceData.range,
            codeToReplaceData,
            docContext,
        })

        if (!suggestedDiff) {
            // This is the final response and we haven't been able to emit a hot-streak suggestion.
            // Even though we do not have a suggested diff, we still want to emit this suggestion.
            // It will be handled downstream, not shown to the user but marked correctly for telemetry purposes
            yield {
                type: 'suggested',
                response,
                uri: document.uri.toString(),
                editPosition: position,
                docContext,
                codeToReplaceData,
            }
            return
        }

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
            editPosition: document.lineAt(suggestedDiff.firstChange.lineNumber).range.end,
        }
    }
}
