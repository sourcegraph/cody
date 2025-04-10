import type { CodeToReplaceData, DocumentContext } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { getCurrentDocContext } from '../../../completions/get-current-doc-context'
import { lines } from '../../../completions/text-processing'
import { wrapVSCodeTextDocument } from '../../../editor/utils/virtual-text-document'
import type { PartialModelResponse, SuccessModelResponse } from '../../adapters/base'
import { autoeditsProviderConfig } from '../../autoedits-config'
import { getDecorationInfoFromPrediction } from '../../autoedits-provider'
import { getCodeToReplaceData } from '../../prompt/prompt-utils'
import type {
    AddedLineInfo,
    DecorationLineInfo,
    ModifiedLineInfo,
    RemovedLineInfo,
    UnchangedLineInfo,
} from '../../renderer/decorators/base'
import { sortDiff } from '../../renderer/diff-utils'
import { trimPredictionToLastFullLine } from './trim-prediction'

export interface TrimPredictionForHotStreakParams {
    latestFullPrediction: string
    processedPrediction: string
    document: vscode.TextDocument
    docContext: DocumentContext
    codeToReplaceData: CodeToReplaceData
    position: vscode.Position
    response: SuccessModelResponse | PartialModelResponse
}

function getLastUnchangedLine(sortedDiff: DecorationLineInfo[]): UnchangedLineInfo | undefined {
    return sortedDiff.findLast(line => line.type === 'unchanged')
}

function getFirstChangedLine(
    sortedDiff: DecorationLineInfo[]
): AddedLineInfo | RemovedLineInfo | ModifiedLineInfo | undefined {
    return sortedDiff.find(line => line.type !== 'unchanged')
}

/**
 * Number of lines that should be accumulated before attempting a hot streak suggestion.
 * Note: Reaching this number does not guarantee a hot streak suggestion will be emitted.
 * The suggestion should also produce a valid diff that is suitable to be chunked.
 */
export const HOT_STREAK_LINES_THRESHOLD = 5

export function getHotStreakChunk({
    latestFullPrediction,
    processedPrediction,
    response,
    document,
    docContext,
    codeToReplaceData,
    position,
}: TrimPredictionForHotStreakParams) {
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

    const processedPredictionRange = new vscode.Range(
        codeToReplaceData.range.start,
        // If we have processed lines, we need to reflect this in the range
        codeToReplaceData.range.start.translate(processedLines)
    )

    const fullDiff = sortDiff(
        getDecorationInfoFromPrediction(document, remainingPrediction, codeToReplaceData.range)
    )
    const lastUnchangedLine = getLastUnchangedLine(fullDiff)
    if (!lastUnchangedLine) {
        // Cannot use this diff
        return null
    }

    // We need to adjust the prediction range to match the prediction so far.
    // This ensures we don't diff the partial prediction against the full codeToRewrite
    const predictionChunkRange = new vscode.Range(
        processedPredictionRange.end,
        new vscode.Position(lastUnchangedLine.originalLineNumber + 1, 0) // Including new line
    )
    const predictionChunkLength = predictionChunkRange.end.line - predictionChunkRange.start.line

    const firstChangedLine = getFirstChangedLine(fullDiff)
    if (!firstChangedLine) {
        // No changes in the diff, we cannot suggest it
        return null
    }

    // We can use the first changed line as a useful indicator for next cursor suggestions
    const firstChangeLineNumber =
        firstChangedLine.type === 'added'
            ? firstChangedLine.modifiedLineNumber
            : firstChangedLine.originalLineNumber

    if (response.type === 'partial' && predictionChunkLength < HOT_STREAK_LINES_THRESHOLD) {
        // Not enough lines to process
        return null
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

    // It is important that we use the correct position when updating docContext, as
    // this is also used to help determine if we can make a valid inline completion or not.
    // Currently we only support inline completions from the first suggestion.
    // TODO: Use the correct updated position for hot-streak suggestions. If it is a completion it should be
    // at the end of the insertText, otherwise it should be unchanged.
    const updatedDocPosition = processedLines === 0 ? position : predictionChunkRange.start

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
        position: predictionChunkRange.start,
        tokenBudget: {
            ...autoeditsProviderConfig.tokenLimit,
            codeToRewritePrefixLines: 0,
            codeToRewriteSuffixLines: predictionChunkLength - 1,
        },
    })

    return {
        text: remainingPrediction,
        codeToReplaceData: adjustedCodeToReplace,
        docContext: updatedDocContext,
        documentSnapshot,
        firstChangeLineNumber: firstChangeLineNumber,
    }
}
