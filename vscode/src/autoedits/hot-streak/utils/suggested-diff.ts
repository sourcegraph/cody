import type { PartialModelResponse, SuccessModelResponse } from '../../adapters/base'
import { getDecorationInfoFromPrediction } from '../../autoedits-provider'
import type { DecorationInfo, DecorationLineInfo } from '../../renderer/decorators/base'
import { sortDiff } from '../../renderer/diff-utils'
import type { TrimPredictionForHotStreakResult } from './trim-prediction'

export interface SuggestedDiff {
    diff: DecorationInfo
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
    const diff = getDecorationInfoFromPrediction(
        chunk.documentSnapshot,
        chunk.text,
        chunk.codeToReplaceData.range
    )

    const sortedDiff = sortDiff(diff)
    const firstChange = sortedDiff.find(line => line.type !== 'unchanged')
    if (!firstChange) {
        // No changes in the diff, we cannot suggest it
        return null
    }

    const firstChangeLineNumber =
        firstChange.type === 'removed' ? firstChange.originalLineNumber : firstChange.modifiedLineNumber

    if (response.type === 'success') {
        return {
            diff,
            firstChange: {
                lineNumber: firstChangeLineNumber,
            },
        }
    }

    const diffAtBoundary = getDiffAtLine(
        sortedDiff,
        chunk.codeToReplaceData.range.end.line - 1 // Excluding the final new line
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
        diff,
        firstChange: {
            lineNumber: firstChangeLineNumber,
        },
    }
}
