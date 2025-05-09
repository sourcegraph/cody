import { calcSlices } from 'fast-myers-diff'
import * as vscode from 'vscode'

import type { CodeToReplaceData } from '@sourcegraph/cody-shared'

import type { PartialModelResponse, SuccessModelResponse } from '../adapters/base'
import { shrinkPredictionUntilSuffix } from '../shrink-prediction'

import { getNewLineChar } from '../../completions/text-processing'
import { SHOULD_USE_STABLE_UNCHANGED_HUNK_THRESHOLD } from './constants'

// Helper enum for code readability when handling slices
enum SliceKind {
    Unchanged = 0,
    Added = 1,
    Removed = -1,
}

interface StableSuggestionParams {
    document: vscode.TextDocument
    range: vscode.Range
    prediction: string
    codeToReplaceData: CodeToReplaceData
    response: SuccessModelResponse | PartialModelResponse
}

interface StableSuggestion {
    suggestionText: string
    suggestionRange: vscode.Range
    firstLineChanged: number | null
    addedLines: string[]
    removedLines: string[]
}

export function normalizePrediction(prediction: string, codeToReplaceData: CodeToReplaceData): string {
    const truncatedPrediction = shrinkPredictionUntilSuffix({
        prediction,
        codeToReplaceData,
    })
    const codeToRewriteNewLine = getNewLineChar(codeToReplaceData.codeToRewrite)
    const codeToRewriteEndsWithNewLine = codeToReplaceData.codeToRewrite.endsWith(codeToRewriteNewLine)
    const predictionNewLine = getNewLineChar(truncatedPrediction)
    const predictionEndsWithNewLine = truncatedPrediction.endsWith(predictionNewLine)

    if (codeToRewriteEndsWithNewLine && !predictionEndsWithNewLine) {
        // Prediction needs to end with a new line to be safely diffed with the code to rewrite
        return truncatedPrediction + predictionNewLine
    }

    if (!codeToRewriteEndsWithNewLine && predictionEndsWithNewLine) {
        // Prediction needs to remove the final new line to be safely diffed with the code to rewrite
        return truncatedPrediction.slice(0, -predictionNewLine.length)
    }

    return truncatedPrediction
}

/**
 * Given a _proposed_ prediction and a _proposed_ range, attempts to form a stable suggestion
 * that is accurate and can be used for diffing purposes.
 * It does this by splitting the diff into hunks, and looking for an unchanged "stable" hunk that
 * we can use as a source of truth. This means we can take a partial response and still produce the
 * correct diff, even if it is adding or removing multiple lines.
 */
export function getStableSuggestion({
    range,
    prediction,
    document,
    codeToReplaceData,
    response,
}: StableSuggestionParams): StableSuggestion | null {
    const originalLines = document.getText(range).split('\n')
    const normalizedPrediction = normalizePrediction(prediction, codeToReplaceData)
    const predictionLines = normalizedPrediction.split('\n')

    // TODO (umpox): `calcSlices` is useful here as it splits the diff into change hunks.
    // It would be preferable if this would use the exact same diff logic as `getDecorationInfo`.
    // We should consider splitting the diff from `decorationInfo` and then supporting deriving the hunks from it for this usecase.
    // Note: `calcSlices` is just a thin wrapper around the same `diff` function we use in `getDecorationInfo`.
    // Code: https://github.com/gliese1337/fast-myers-diff/blob/7cc1419ca3e8453c0828d93921c23d875ebf622a/src/index.ts#L325-L336
    const slices = calcSlices(originalLines, predictionLines)
    const state = {
        predictionLines: [] as string[],
        predictionIncludesChange: false,
        addedLines: [] as string[],
        removedLines: [] as string[],
        firstLineChanged: null as number | null,
        canSuggestDiff: false,
    }

    for (const [kind, parts] of slices) {
        if (kind === SliceKind.Unchanged) {
            state.predictionLines.push(...parts)

            // Use the improved stability checker to determine if this hunk is stable
            if (!isStableUnchangedHunk(parts)) {
                // Not a stable hunk - continue looking for a better one
                continue
            }

            if (state.predictionIncludesChange) {
                state.canSuggestDiff = true
                // We already have a change further up in the diff.
                // As we have now reached an unchanged "stable" hunk, it means we can reliably
                // use this diff.
                break
            }

            // We hit an unchanged line but we have not yet reached a change in the diff.
            // Keep looking for a change before using this diff.
            continue
        }

        state.predictionIncludesChange = true
        if (!state.firstLineChanged) {
            state.firstLineChanged = range.start.line + state.predictionLines.length
        }

        if (kind === SliceKind.Removed) {
            // Deleted hunk.
            // Track the deleted line count, but do not add it to the diffLines
            state.removedLines.push(...parts)
            continue
        }

        if (kind === SliceKind.Added) {
            // Inserted hunk.
            // Track the inserted line count and add it to the diffLines
            state.addedLines.push(...parts)
            state.predictionLines.push(...parts)
        }
    }

    // We always expect that a prediction ends with a new line, if the prediction we derived from the diff
    // does not end with a new line, we add one.
    const suggestionText =
        state.predictionLines.at(-1) === ''
            ? state.predictionLines.join('\n')
            : state.predictionLines.join('\n') + '\n'

    const linesAffected = suggestionText.split('\n').length - 1
    const lineDelta = state.addedLines.length - state.removedLines.length
    const suggestionRange = new vscode.Range(
        range.start,
        range.start.translate(linesAffected - lineDelta)
    )

    // If we have finished the response we always want to emit this response,
    // even if it includes no changes or if it ends on an change
    const canSuggest = response.type === 'success' || state.canSuggestDiff
    if (!canSuggest) {
        return null
    }

    return {
        suggestionText,
        suggestionRange,
        firstLineChanged: state.firstLineChanged,
        addedLines: state.addedLines,
        removedLines: state.removedLines,
    }
}

const CODE_DELIMITER_REGEX = /^[\[\]{}().,;:]+$/

/**
 * Classify an unchanged hunk as stable only if it meets a set of heuristics that are
 * designed to improve the stability of a partial diff.
 */
export function isStableUnchangedHunk(hunk: string[]): boolean {
    if (hunk.length < SHOULD_USE_STABLE_UNCHANGED_HUNK_THRESHOLD) {
        // Hunk isn't classed as big enough to be considered stable.
        return false
    }

    /**
     * Filter hunk lines to find relevant ones that:
     * 1. Contain more than just whitespace
     * 2. Contain more than just code delimiters, as these are often repeated across multiple lines
     */
    const relevantHunkLines = hunk.filter(line => {
        const lineContent = line.trim()
        return lineContent.length > 0 && !CODE_DELIMITER_REGEX.test(lineContent)
    })

    return relevantHunkLines.length > 0
}
