import { CodeToReplaceData } from '@sourcegraph/cody-shared'
import type { ModelResponse } from './adapters/base'
import { getDecorationInfo, isOnlyAddingText } from './renderer/diff-utils'
import type { AutoeditRequestManagerParams } from './request-manager'
import type { InflightRequest } from './request-manager'

/**
 * Reasons why a request cannot be recycled, for now only for debugging purposes.
 * Later will be integrated with the auto-edit debug panel.
 */
export const notRecyclableReason = {
    notSuccess: 1,
    startedAfterInflightRequest: 2,
    notSameFile: 3,
    outsideOfPreviousRange: 4,
    notOnlyAdditions: 5,
    moreThanOneLineAddedOrModified: 6,
    notEnoughAddedOrModifiedLines: 7,
    predictedTextDoesNotMatch: 8,
} as const

type NotRecyclableReason = (typeof notRecyclableReason)[keyof typeof notRecyclableReason]
/** We are interested in changes by character while looking for type-forward patterns */
const CHARACTER_REGEX = /./g

/**
 * Check if a completed request can be recycled for an in-flight request
 * based on type-forward pattern detection
 */
export function isNotRecyclableRequest(
    completedRequest: InflightRequest,
    inflightRequest: InflightRequest,
    response: ModelResponse
): NotRecyclableReason | false {
    if (response.type !== 'success') {
        return notRecyclableReason.notSuccess
    }

    if (completedRequest.startedAt > inflightRequest.startedAt) {
        return notRecyclableReason.startedAfterInflightRequest
    }

    const notRelevantReason = isRequestNotRelevant(completedRequest.params, inflightRequest.params)
    if (notRelevantReason) {
        return notRelevantReason
    }

    const originalText = completedRequest.params.codeToReplaceData.codeToRewrite
    const currentText = inflightRequest.params.codeToReplaceData.codeToRewrite
    const prediction = response.prediction

    const decorationInfoTyped = getDecorationInfo(originalText, currentText, CHARACTER_REGEX)

    // For now, we only recycle responses if the only change is an addition
    const onlyAdding = isOnlyAddingText(decorationInfoTyped)

    if (onlyAdding) {
        // If there are added more than one line, this is unlikely to be a type-forward case
        // as we're looking for small incremental edits
        if (decorationInfoTyped.addedLines.length + decorationInfoTyped.modifiedLines.length > 1) {
            return notRecyclableReason.moreThanOneLineAddedOrModified
        }

        const decorationInfoPrediction = getDecorationInfo(originalText, prediction, CHARACTER_REGEX)

        if (decorationInfoTyped.addedLines.length === 1) {
            const typedAddedLine = decorationInfoTyped.addedLines[0]
            const predictedMatchingLine = [
                ...decorationInfoPrediction.modifiedLines,
                ...decorationInfoPrediction.addedLines,
            ].find(line => line.modifiedLineNumber === typedAddedLine.modifiedLineNumber)
            const updatedOrNewText =
                predictedMatchingLine?.type === 'added'
                    ? predictedMatchingLine.text
                    : predictedMatchingLine?.newText
            return updatedOrNewText?.startsWith(typedAddedLine.text)
                ? false
                : notRecyclableReason.predictedTextDoesNotMatch
        }

        if (decorationInfoTyped.modifiedLines.length === 1) {
            const typedModifiedLine = decorationInfoTyped.modifiedLines[0]
            const predictedModifiedLine = [
                ...decorationInfoPrediction.modifiedLines,
                ...decorationInfoPrediction.addedLines,
            ].find(line => line.modifiedLineNumber === typedModifiedLine.modifiedLineNumber)
            const updatedOrNewText =
                predictedModifiedLine?.type === 'added'
                    ? predictedModifiedLine.text
                    : predictedModifiedLine?.newText

            return updatedOrNewText?.startsWith(typedModifiedLine.newText)
                ? false
                : notRecyclableReason.predictedTextDoesNotMatch
        }
    }

    return notRecyclableReason.notOnlyAdditions
}

// TODO: reuse inside of `isNotRecyclableRequest` and reduce duplication.
export function isNotRecyclableCacheItem(
    cachedData: { codeToReplaceData: CodeToReplaceData; documentUri: string },
    currentData: { codeToReplaceData: CodeToReplaceData; documentUri: string },
    response: ModelResponse
) {
    if (response.type !== 'success') {
        return notRecyclableReason.notSuccess
    }

    const notRelevantReason = isRequestNotRelevant(cachedData, currentData)
    if (notRelevantReason) {
        return notRelevantReason
    }

    const originalText = cachedData.codeToReplaceData.codeToRewrite
    const currentText = currentData.codeToReplaceData.codeToRewrite
    const prediction = response.prediction

    const decorationInfoTyped = getDecorationInfo(originalText, currentText, CHARACTER_REGEX)

    // For now, we only recycle responses if the only change is an addition
    const onlyAdding = isOnlyAddingText(decorationInfoTyped)

    if (onlyAdding) {
        // If there are added more than one line, this is unlikely to be a type-forward case
        // as we're looking for small incremental edits
        if (decorationInfoTyped.addedLines.length + decorationInfoTyped.modifiedLines.length > 1) {
            return notRecyclableReason.moreThanOneLineAddedOrModified
        }

        const decorationInfoPrediction = getDecorationInfo(originalText, prediction, CHARACTER_REGEX)

        if (decorationInfoTyped.addedLines.length === 1) {
            const typedAddedLine = decorationInfoTyped.addedLines[0]
            const predictedMatchingLine = [
                ...decorationInfoPrediction.modifiedLines,
                ...decorationInfoPrediction.addedLines,
            ].find(line => line.modifiedLineNumber === typedAddedLine.modifiedLineNumber)
            const updatedOrNewText =
                predictedMatchingLine?.type === 'added'
                    ? predictedMatchingLine.text
                    : predictedMatchingLine?.newText
            return updatedOrNewText?.startsWith(typedAddedLine.text)
                ? false
                : notRecyclableReason.predictedTextDoesNotMatch
        }

        if (decorationInfoTyped.modifiedLines.length === 1) {
            const typedModifiedLine = decorationInfoTyped.modifiedLines[0]
            const predictedModifiedLine = [
                ...decorationInfoPrediction.modifiedLines,
                ...decorationInfoPrediction.addedLines,
            ].find(line => line.modifiedLineNumber === typedModifiedLine.modifiedLineNumber)
            const updatedOrNewText =
                predictedModifiedLine?.type === 'added'
                    ? predictedModifiedLine.text
                    : predictedModifiedLine?.newText

            return updatedOrNewText?.startsWith(typedModifiedLine.newText)
                ? false
                : notRecyclableReason.predictedTextDoesNotMatch
        }
    }

    return notRecyclableReason.notOnlyAdditions
}

/**
 * Determines if a request is still relevant compared to the latest request params
 */
export function isRequestNotRelevant(
    oldParams: Pick<AutoeditRequestManagerParams, 'documentUri' | 'codeToReplaceData'>,
    currentParams: Pick<AutoeditRequestManagerParams, 'documentUri' | 'codeToReplaceData'>
): NotRecyclableReason | false {
    if (oldParams.documentUri !== currentParams.documentUri) {
        return notRecyclableReason.notSameFile
    }

    const startLineDiff =
        oldParams.codeToReplaceData.range.start.line - currentParams.codeToReplaceData.range.start.line

    if (startLineDiff > 1 || startLineDiff < 0) {
        return notRecyclableReason.outsideOfPreviousRange
    }

    return false
}
