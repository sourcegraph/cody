import type { CodeToReplaceData, DocumentContext } from '@sourcegraph/cody-shared'
import * as uui from 'uuid'

import * as vscode from 'vscode'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { getNewLineChar } from '../../completions/text-processing'
import { wrapVSCodeTextDocument } from '../../editor/utils/virtual-text-document'
import { AutoeditStopReason, type ModelResponse } from '../adapters/base'
import type { AutoeditHotStreakID } from '../analytics-logger'
import { autoeditsProviderConfig } from '../autoedits-config'
import type {
    AbortedPredictionResult,
    IgnoredPredictionResult,
    SuggestedPredictionResult,
} from '../autoedits-provider'
import { getCodeToReplaceData } from '../prompt/prompt-utils/code-to-replace'
import { isDuplicatingTextFromRewriteArea } from '../utils'
import { getHotStreakChunk } from './get-chunk'
import { getStableSuggestion } from './stable-suggestion'
import { postProcessCompletion } from './utils'

export interface ProcessHotStreakResponsesParams {
    responseGenerator: AsyncGenerator<ModelResponse>
    document: vscode.TextDocument
    codeToReplaceData: CodeToReplaceData
    requestDocContext: DocumentContext
    position: vscode.Position
    options: {
        // If hot-streak is actually enabled. If it is not, we will not attempt to emit
        // any hot-streak suggestions and wait for the final response.
        hotStreakEnabled?: boolean
    }
}

export type ProcessedHotStreakResponse = (
    | Omit<SuggestedPredictionResult, 'cacheId'>
    | IgnoredPredictionResult
    | AbortedPredictionResult
) & {
    /** For autoedit debug panel */
    fullPrediction?: string
}

/**
 * Process a stream of model responses and attempt to emit a "hot-streak" suggestion.
 * A hot-streak is where we emit suggestions before the model is done generating.
 * This allows us to use a large rewrite window whilst still achieving low latency responses.
 */
export async function* processHotStreakResponses({
    responseGenerator,
    document: originalDocument,
    codeToReplaceData,
    requestDocContext,
    position,
    options,
}: ProcessHotStreakResponsesParams): AsyncGenerator<ProcessedHotStreakResponse> {
    let hotStreakId = null
    let virtualDocument = TextDocument.create(
        originalDocument.uri.toString(),
        originalDocument.languageId,
        originalDocument.version,
        originalDocument.getText()
    )
    const document = wrapVSCodeTextDocument(virtualDocument)

    for await (const response of responseGenerator) {
        // Post process the prediction
        if (response.type !== 'aborted') {
            response.prediction = postProcessCompletion(response.prediction)
        }

        const canHotStreak = hotStreakId
            ? // If we have already started emitted hot-streak suggestions, then we should treat all responses as hot-streaks
              response.type === 'partial' || response.type === 'success'
            : // Otherwise only attempt doing so for partial responses.
              response.type === 'partial'

        if (options.hotStreakEnabled && canHotStreak && response.type !== 'aborted') {
            const predictionChunk = getHotStreakChunk({
                prediction: response.prediction,
                document,
                position,
                codeToReplaceData,
                response,
            })

            if (!predictionChunk) {
                // Cannot emit a prediction
                continue
            }

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

            // TODO: Right now we always use the provided `position` in which the auto-edit was triggered from.
            // This works great for the first chunk, but we should try to match the position of the users' cursor
            // on the assumption that they have accepted the previous chunk (if present). For example, if the previous
            // chunk was an inline completion, the cursor is moved to the end of the completion range when accepted.
            // If we matched this new position, it would mean it would be possible to chain inline completions.
            const hotStreakPosition = position

            // The hot streak prediction excludes part of the prediction. This means that it fundamentally relies
            // on this prediction part existing in the document to be a valid suggestion. We need to update the
            // docContext to reflect this.
            const updatedDocContext = getCurrentDocContext({
                document,
                position: hotStreakPosition,
                maxPrefixLength: requestDocContext.maxPrefixLength,
                maxSuffixLength: requestDocContext.maxSuffixLength,
            })

            const lengthOfChunk = predictionChunk.range.end.line - predictionChunk.range.start.line - 1
            const adjustedCodeToReplace = getCodeToReplaceData({
                docContext: updatedDocContext,
                document,
                position: hotStreakPosition,
                tokenBudget: {
                    ...autoeditsProviderConfig.tokenLimit,
                    codeToRewriteSuffixLines: Math.max(
                        lengthOfChunk - autoeditsProviderConfig.tokenLimit.codeToRewritePrefixLines,
                        0
                    ),
                },
            })

            const newLineChar = getNewLineChar(adjustedCodeToReplace.codeToRewrite)
            if (
                predictionChunk.text === adjustedCodeToReplace.codeToRewrite ||
                isDuplicatingTextFromRewriteArea({
                    addedText: predictionChunk.addedLines.join(newLineChar),
                    codeToReplaceData: adjustedCodeToReplace,
                })
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

            if (!hotStreakId) {
                // We are emitting a hot streak prediction. This means that all future response should be treated as hot streaks.
                hotStreakId = uui.v4() as AutoeditHotStreakID
            }

            // Update the virtual document with the latest prediction.
            // This is required as each subsequent prediction ultimately relies on the previous
            // prediction being accepted
            virtualDocument = TextDocument.update(
                virtualDocument,
                [{ range: predictionChunk.range, text: predictionChunk.text }],
                document.version + 1
            )

            yield {
                type: 'suggested',
                response: {
                    ...response,
                    prediction: predictionChunk.text,
                    stopReason: AutoeditStopReason.HotStreak,
                },
                uri: document.uri.toString(),
                // We use the first line of the diff as the next cursor position.
                // This is useful so that we can support "jumping" to this suggestion from a different part of the document
                editPosition: document.lineAt(predictionChunk.firstLineChanged).range.end,
                docContext: updatedDocContext,
                codeToReplaceData: adjustedCodeToReplace,
                hotStreakId,
                fullPrediction: response.prediction,
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

        if (!options.hotStreakEnabled) {
            yield {
                type: 'suggested',
                response,
                uri: document.uri.toString(),
                docContext: requestDocContext,
                codeToReplaceData,
                // Note: We still emit a position when hot streak is disabled, but it is not an accurate
                // `editPosition`. This is just so we can maintain a single type whilst the feature flag is used.
                // The `editPosition` here will never actually be used.
                editPosition: position,
                fullPrediction: response.prediction,
            }
            return
        }

        const suggestion = getStableSuggestion({
            range: codeToReplaceData.range,
            prediction: response.prediction,
            document,
            codeToReplaceData,
            response,
        })

        if (!suggestion || suggestion.firstLineChanged === null) {
            yield { type: 'ignored', response }
            return
        }

        yield {
            type: 'suggested',
            response,
            uri: document.uri.toString(),
            docContext: requestDocContext,
            codeToReplaceData,
            // Note that an `editPosition` is returned here regardless of whether the suggestion is a hot-streak.
            // This is so this can still be used as a "next cursor" prediction source for a scenario where we have
            // a long rewrite window but the only change is at the bottom, far away from the users' cursor.
            // In these scenarios we should show a next cursor suggestion instead of the code suggestion.
            editPosition: document.validatePosition(
                new vscode.Position(suggestion.firstLineChanged, Number.MAX_SAFE_INTEGER)
            ),
            fullPrediction: response.prediction,
        }
    }
}
