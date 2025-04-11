import type { CodeToReplaceData, DocumentContext } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { getCurrentDocContext } from '../../../completions/get-current-doc-context'
import { lines } from '../../../completions/text-processing'
import { wrapVSCodeTextDocument } from '../../../editor/utils/virtual-text-document'
import type { PartialModelResponse, SuccessModelResponse } from '../../adapters/base'
import { autoeditsProviderConfig } from '../../autoedits-config'
import { getCodeToReplaceData } from '../../prompt/prompt-utils'

function trimPredictionToLastFullLine(prediction: string): string {
    if (!prediction) {
        return prediction
    }

    // If the prediction ends with a newline, it's already complete
    if (prediction.endsWith('\n')) {
        return prediction
    }

    const lastNewlineIndex = prediction.lastIndexOf('\n')
    if (lastNewlineIndex === -1) {
        // If there's no newline, we can't trim to a complete line
        return ''
    }

    // Return everything up to and including the last newline
    return prediction.substring(0, lastNewlineIndex + 1)
}

export interface TrimPredictionForHotStreakParams {
    latestFullPrediction: string
    processedPrediction: string
    document: vscode.TextDocument
    docContext: DocumentContext
    codeToReplaceData: CodeToReplaceData
    position: vscode.Position
    response: SuccessModelResponse | PartialModelResponse
}

export interface TrimPredictionForHotStreakResult {
    text: string
    codeToReplaceData: CodeToReplaceData
    docContext: DocumentContext
    documentSnapshot: vscode.TextDocument
}

export function trimPredictionForHotStreak({
    latestFullPrediction,
    processedPrediction,
    document,
    docContext,
    codeToReplaceData,
    position,
    response,
}: TrimPredictionForHotStreakParams): TrimPredictionForHotStreakResult | null {
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

    const chunkLineCount = lines(remainingPrediction).length - 1
    const processedPredictionRange = new vscode.Range(
        codeToReplaceData.range.start,
        // If we have processed lines, we need to reflect this in the range
        codeToReplaceData.range.start.translate(processedLines)
    )

    // We need to adjust the prediction range to match the prediction so far.
    // This ensures we don't diff the partial prediction against the full codeToRewrite
    const remainingPredictionRange = new vscode.Range(
        processedPredictionRange.end,
        processedPredictionRange.end.translate(chunkLineCount)
    )

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
    const updatedDocPosition = processedLines === 0 ? position : remainingPredictionRange.start

    // The hot streak prediction excludes part of the processedPrediction. This means that it fundamentally relies
    // on the processedPrediction existing in the document to be a valid suggestion. We need to update the docContext
    // to reflect this.
    const updatedDocContext = getCurrentDocContext({
        document: documentSnapshot,
        position: updatedDocPosition,
        maxPrefixLength: docContext.maxPrefixLength,
        maxSuffixLength: docContext.maxSuffixLength,
    })

    // const remainingPrefixLines = Math.max(
    //     autoeditsProviderConfig.tokenLimit.codeToRewritePrefixLines - processedLines,
    //     0
    // )
    // const remainingSuffixLines = Math.max(chunkLineCount - remainingPrefixLines + 1, 0)
    const adjustedCodeToReplace = getCodeToReplaceData({
        docContext: updatedDocContext,
        document: documentSnapshot,
        position: remainingPredictionRange.start,
        tokenBudget: {
            ...autoeditsProviderConfig.tokenLimit,
            codeToRewritePrefixLines: 0,
            codeToRewriteSuffixLines: chunkLineCount - 1,
        },
    })

    return {
        text: remainingPrediction,
        codeToReplaceData: adjustedCodeToReplace,
        docContext: updatedDocContext,
        documentSnapshot,
    }
}
