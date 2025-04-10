import type { PartialModelResponse, SuccessModelResponse } from '../../adapters/base'
import { getDecorationInfoFromPrediction } from '../../autoedits-provider'
import type { DecorationInfo, DecorationLineInfo } from '../../renderer/decorators/base'
import { getDiffChangeBoundaries } from '../../renderer/diff-utils'
import type { TrimPredictionForHotStreakResult } from './trim-prediction'

export interface SuggestedDiff {
    diff: DecorationInfo
    firstChange: {
        type: Exclude<DecorationLineInfo['type'], 'unchanged'>
        lineNumber: number
    }
    lastChange: {
        type: Exclude<DecorationLineInfo['type'], 'unchanged'>
        lineNumber: number
    }
}

export function getSuggestedDiffForChunk(
    response: SuccessModelResponse | PartialModelResponse,
    chunk: TrimPredictionForHotStreakResult
): SuggestedDiff | null {
    const diff = getDecorationInfoFromPrediction(chunk.documentSnapshot, chunk.text, chunk.range)
    const diffChangeBoundaries = getDiffChangeBoundaries(diff)
    if (!diffChangeBoundaries) {
        // Diff doesn't have any changes, so we can't suggest this diff
        return null
    }

    const [firstLineOfDiff, lastLineOfDiff] = diffChangeBoundaries
    const firstLineNumberOfDiff =
        firstLineOfDiff.type === 'added'
            ? firstLineOfDiff.modifiedLineNumber
            : firstLineOfDiff.originalLineNumber
    const lastLineNumberOfDiff =
        lastLineOfDiff.type === 'added'
            ? lastLineOfDiff.modifiedLineNumber
            : lastLineOfDiff.originalLineNumber

    if (response.type === 'partial' && lastLineNumberOfDiff === chunk.range.end.line - 1) {
        // We only emit a hot streak prediction when the final line of the prediction range is unchanged.
        // This ensures that the diff is appropriately chunked.
        // Example: If the last line of the range was removed, it may be that the LLM is actually replacing
        // this line with another one in the next chunk.
        return null
    }

    return {
        diff,
        firstChange: {
            type: firstLineOfDiff.type,
            lineNumber: firstLineNumberOfDiff,
        },
        lastChange: {
            type: lastLineOfDiff.type,
            lineNumber: lastLineNumberOfDiff,
        },
    }
}
