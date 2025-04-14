import type { CodeToReplaceData, DocumentContext } from '@sourcegraph/cody-shared'
import { calcSlices } from 'fast-myers-diff'
import * as vscode from 'vscode'
import { lines } from '../../completions/text-processing'
import type { PartialModelResponse, SuccessModelResponse } from '../adapters/base'

import { TextDocument } from 'vscode-languageserver-textdocument'
import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { wrapVSCodeTextDocument } from '../../editor/utils/virtual-text-document'
import { autoeditsProviderConfig } from '../autoedits-config'
import { getCodeToReplaceData } from '../prompt/prompt-utils'
import { shrinkPredictionUntilSuffix } from '../shrink-prediction'
import { trimPredictionToLastFullLine } from './utils'

/**
 * Number of lines that should be accumulated before attempting a hot streak suggestion.
 * Note: Reaching this number does not guarantee a hot streak suggestion will be emitted.
 * The suggestion should also produce a valid diff that is suitable to be chunked.
 */
export const HOT_STREAK_LINES_THRESHOLD = 5

// Helper enum for code readability when handling slices
enum SliceKind {
    Unchanged = 0,
    Added = 1,
    Removed = -1,
}

interface StableSuggestionParams {
    range: vscode.Range
    prediction: string
    document: vscode.TextDocument
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
    const shrinkedPrediction = shrinkPredictionUntilSuffix({
        prediction,
        codeToReplaceData,
    })
    const predictionLines = shrinkedPrediction.split('\n')

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

            if (parts.every(part => part.length === 0)) {
                // Empty unchanged hunk (e.g. an empty line)
                // This isn't stable enough to emit a suggestion
                continue
            }

            const meetsLineThreshold =
                response.type === 'success' || state.predictionLines.length >= HOT_STREAK_LINES_THRESHOLD
            if (state.predictionIncludesChange && meetsLineThreshold) {
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
    const linesAdded = state.addedLines.length - 1
    const linesRemoved = state.removedLines.length - 1
    const lineDelta = linesAdded - linesRemoved
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

export interface GetHotStreakChunkParams {
    latestFullPrediction: string
    processedPrediction: string
    document: vscode.TextDocument
    docContext: DocumentContext
    codeToReplaceData: CodeToReplaceData
    position: vscode.Position
    response: SuccessModelResponse | PartialModelResponse
}

export interface HotStreakChunk {
    text: string
    addedLines: string[]
    deletedLines: string[]
    codeToReplaceData: CodeToReplaceData
    docContext: DocumentContext
    documentSnapshot: vscode.TextDocument
    firstLineChanged: number | null
}

/**
 * Produces a hot-streak chunk and associated metadata from the latest full prediction.
 */
export function getHotStreakChunk({
    latestFullPrediction,
    processedPrediction,
    response,
    document,
    docContext,
    codeToReplaceData,
    position,
}: GetHotStreakChunkParams): HotStreakChunk | null {
    const processedLines = processedPrediction.length > 0 ? lines(processedPrediction).length - 1 : 0
    const trimmedPrediction =
        response.type === 'success'
            ? response.prediction
            : trimPredictionToLastFullLine(latestFullPrediction)
    const remainingPrediction = lines(trimmedPrediction).slice(processedLines).join('\n')
    if (remainingPrediction.length === 0) {
        // No complete lines to process
        return null
    }

    const processedRange = new vscode.Range(
        codeToReplaceData.range.start,
        // If we have processed lines, we need to reflect this in the range
        codeToReplaceData.range.start.translate(processedLines)
    )

    const predictionLines = lines(remainingPrediction).length - 1
    const expectedDiffRange = new vscode.Range(
        codeToReplaceData.range.start.translate(processedLines),
        codeToReplaceData.range.start.translate(processedLines + predictionLines)
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

    const { suggestionRange: changeRange, suggestionText: changeText, firstLineChanged } = suggestion

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
            [{ range: processedRange, text: processedPrediction }],
            document.version + 1
        )
        documentSnapshot = wrapVSCodeTextDocument(mutableDocument)
    }

    // It is important that we use the correct position when updating docContext, as
    // this is also used to help determine if we can make a valid inline completion or not.
    // Currently we only support inline completions from the first suggestion.
    // TODO: Use the correct updated position for hot-streak suggestions. If it is a completion it should be
    // at the end of the insertText, otherwise it should be unchanged.
    const updatedDocPosition = processedPrediction.length === 0 ? position : changeRange.start

    // The hot streak prediction excludes part of the prefix. This means that it fundamentally relies
    // on the prefix existing in the document to be a valid suggestion. We need to update the docContext
    // to reflect this.
    const updatedDocContext = getCurrentDocContext({
        document: documentSnapshot,
        position: updatedDocPosition,
        maxPrefixLength: docContext.maxPrefixLength,
        maxSuffixLength: docContext.maxSuffixLength,
    })

    const adjustedCodeToReplace = getCodeToReplaceData({
        docContext: updatedDocContext,
        document: documentSnapshot,
        position: changeRange.start,
        tokenBudget: {
            ...autoeditsProviderConfig.tokenLimit,
            codeToRewritePrefixLines: 0,
            codeToRewriteSuffixLines: changeRange.end.line - changeRange.start.line - 1,
        },
    })

    return {
        text: changeText,
        addedLines: suggestion.addedLines,
        deletedLines: suggestion.removedLines,
        codeToReplaceData: adjustedCodeToReplace,
        docContext: updatedDocContext,
        documentSnapshot,
        firstLineChanged,
    }
}
