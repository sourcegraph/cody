import type { PartialModelResponse, SuccessModelResponse } from '../../adapters/base'
import { getDecorationInfoFromPrediction } from '../../autoedits-provider'
import type { DecorationInfo, DecorationLineInfo } from '../../renderer/decorators/base'
import { sortDiff } from '../../renderer/diff-utils'
import { shrinkPredictionUntilSuffix } from '../../shrink-prediction'
import { isPredictedTextAlreadyInSuffix } from '../../utils'
import type { TrimPredictionForHotStreakResult } from './trim-prediction'

export interface SuggestedDiff {
    decorationInfo: DecorationInfo
    firstChange: {
        lineNumber: number
    }
}

function getDiffAtLine(sortedDiff: DecorationLineInfo[], line: number): DecorationLineInfo | undefined {
    return sortedDiff.find(diffLine => {
        const relevantLineNumber =
            diffLine.type === 'removed' ? diffLine.originalLineNumber : diffLine.modifiedLineNumber
        return relevantLineNumber === line
    })
}

export function getSuggestedDiffForChunk(
    response: SuccessModelResponse | PartialModelResponse,
    chunk: TrimPredictionForHotStreakResult
): SuggestedDiff | null {
    const { documentSnapshot, text, codeToReplaceData } = chunk

    const shrinkedPrediction = shrinkPredictionUntilSuffix({
        prediction: text,
        codeToReplaceData,
    })

    // Shrink the prediction to avoid emitting a hot-streak item
    // that later will be hidden by the autoedit-provider because the end of the prediction matches
    // suffxi that is already in the document.
    const decorationInfo = getDecorationInfoFromPrediction(
        documentSnapshot,
        shrinkedPrediction,
        codeToReplaceData.range
    )

    const sortedDecorationInfo = sortDiff(decorationInfo)
    const firstChange = sortedDecorationInfo.find(line => line.type !== 'unchanged')
    if (!firstChange) {
        // No changes in the diff, we cannot suggest it
        return null
    }

    // Check if the suffix is already in the document
    // TODO: reduce this logic between the auto-edit provider and the hot-streak utils
    if (
        isPredictedTextAlreadyInSuffix({
            decorationInfo,
            codeToRewrite: codeToReplaceData.codeToRewrite,
            suffix: codeToReplaceData.suffixInArea + codeToReplaceData.suffixAfterArea,
        })
    ) {
        return null
    }

    const firstChangeLineNumber =
        firstChange.type === 'removed' ? firstChange.originalLineNumber : firstChange.modifiedLineNumber

    if (response.type === 'success') {
        return {
            decorationInfo,
            firstChange: {
                lineNumber: firstChangeLineNumber,
            },
        }
    }

    const diffAtBoundary = getDiffAtLine(
        sortedDecorationInfo,
        codeToReplaceData.range.end.line - 1 // Excluding the final new line
    )
    if (diffAtBoundary?.type !== 'unchanged') {
        console.log('IGNORING BECAUSE DIFF BOUNDARY IS CHANGED', diffAtBoundary)
        // We only emit a hot streak prediction when the final line of the prediction range is unchanged.
        // This ensures that the diff is appropriately chunked.
        // Example: If the last line of the range was removed, it may be that the LLM is actually replacing
        // this line with another one in the next chunk.
        return null
    }

    return {
        decorationInfo,
        firstChange: {
            lineNumber: firstChangeLineNumber,
        },
    }
}
