import type { CodeToReplaceData } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import { lines } from '../../completions/text-processing'
import type { PartialModelResponse, SuccessModelResponse } from '../adapters/base'

import { SHOULD_ATTEMPT_HOT_STREAK_CHUNK_THRESHOLD } from './constants'
import { getStableSuggestion } from './stable-suggestion'
import { trimPredictionToLastFullLine } from './utils'

export interface GetHotStreakChunkParams {
    prediction: string
    document: vscode.TextDocument
    codeToReplaceData: CodeToReplaceData
    position: vscode.Position
    response: SuccessModelResponse | PartialModelResponse
}

export interface HotStreakChunk {
    text: string
    range: vscode.Range
    addedLines: string[]
    deletedLines: string[]
    firstLineChanged: number | null
}

/**
 * Produces a hot-streak chunk and associated metadata from the latest full prediction.
 */
export function getHotStreakChunk({
    prediction,
    response,
    document,
    codeToReplaceData,
}: GetHotStreakChunkParams): HotStreakChunk | null {
    const remainingPrediction =
        response.type === 'success' ? response.prediction : trimPredictionToLastFullLine(prediction)
    if (remainingPrediction.length === 0) {
        // No complete lines to process
        return null
    }

    const predictionLines = lines(remainingPrediction).length - 1
    const meetsLineThreshold =
        response.type === 'success' || predictionLines >= SHOULD_ATTEMPT_HOT_STREAK_CHUNK_THRESHOLD
    if (!meetsLineThreshold) {
        return null
    }

    const expectedDiffRange = new vscode.Range(
        codeToReplaceData.range.start,
        codeToReplaceData.range.start.translate(predictionLines)
    )

    const suggestion = getStableSuggestion({
        range: expectedDiffRange,
        prediction: remainingPrediction,
        document,
        codeToReplaceData,
        response,
    })
    if (!suggestion) {
        return null
    }

    return {
        text: suggestion.suggestionText,
        range: suggestion.suggestionRange,
        firstLineChanged: suggestion.firstLineChanged,
        addedLines: suggestion.addedLines,
        deletedLines: suggestion.removedLines,
    }
}
