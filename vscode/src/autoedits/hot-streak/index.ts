import type { CodeToReplaceData, DocumentContext } from '@sourcegraph/cody-shared'
import * as uui from 'uuid'

import type * as vscode from 'vscode'

import { AutoeditStopReason, type ModelResponse } from '../adapters/base'
import type { AutoeditHotStreakID } from '../analytics-logger'
import type {
    AbortedPredictionResult,
    IgnoredPredictionResult,
    SuggestedPredictionResult,
} from '../autoedits-provider'
import { getHotStreakChunk, getStableSuggestion } from './get-chunk'

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
    Omit<SuggestedPredictionResult, 'cacheId'> | IgnoredPredictionResult | AbortedPredictionResult
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
            const predictionChunk = getHotStreakChunk({
                latestFullPrediction: response.prediction,
                processedPrediction,
                document,
                docContext,
                position,
                codeToReplaceData,
                response,
            })

            if (!predictionChunk) {
                // Cannot emit a prediction
                continue
            }

            if (!hotStreakId) {
                // We are emitting a hot streak prediction. This means that all future response should be treated as hot streaks.
                hotStreakId = uui.v4() as AutoeditHotStreakID
            }

            // Track the number of lines we have processed, this is used to trim the prediction accordingly in the next response.
            processedPrediction = processedPrediction + predictionChunk.text

            if (!predictionChunk.firstLineChanged) {
                yield {
                    type: 'ignored',
                    response: {
                        ...response,
                        prediction: predictionChunk.text,
                        stopReason: AutoeditStopReason.HotStreak,
                    },
                }
                continue
            }

            // TODO: Can we omit trimEnd?
            if (
                predictionChunk.text.trimEnd() ===
                predictionChunk.codeToReplaceData.codeToRewrite.trimEnd()
            ) {
                // The adjusted codeToRewrite is the same as the prediction.
                // We should not emit this prediction
                yield {
                    type: 'ignored',
                    response: {
                        ...response,
                        prediction: predictionChunk.text,
                        stopReason: AutoeditStopReason.HotStreak,
                    },
                }
                continue
            }

            yield {
                type: 'suggested',
                response: {
                    ...response,
                    prediction: predictionChunk.text,
                    stopReason: AutoeditStopReason.HotStreak,
                },
                uri: predictionChunk.documentSnapshot.uri.toString(),
                // We use the first line of the diff as the next cursor position.
                // This is useful so that we can support "jumping" to this suggestion from a different part of the document
                editPosition: predictionChunk.documentSnapshot.lineAt(predictionChunk.firstLineChanged)
                    .range.end,
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

        const suggestion = getStableSuggestion({
            range: codeToReplaceData.range,
            prediction: response.prediction,
            document,
            codeToReplaceData,
            response,
        })

        if (!suggestion || !suggestion.firstLineChanged) {
            yield { type: 'ignored', response }
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
            editPosition: document.lineAt(suggestion.firstLineChanged).range.end,
        }
    }
}
