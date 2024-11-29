import { diff } from 'fast-myers-diff'
import * as vscode from 'vscode'

import { getNewLineChar } from '../../completions/text-processing'

import type { DecorationInfo, DecorationLineInfo, LineChange, ModifiedLineInfo } from './decorators/base'

/**
 * Generates decoration information by computing the differences between two texts.
 *
 * @param originalText The original text content.
 * @param modifiedText The modified text content.
 * @returns Decoration information representing the differences.
 */
export function getDecorationInfo(originalText: string, modifiedText: string): DecorationInfo {
    const originalLines = originalText.split(getNewLineChar(originalText))
    const modifiedLines = modifiedText.split(getNewLineChar(modifiedText))

    const lineInfos = computeDiffOperations(originalLines, modifiedLines)

    const decorationInfo: DecorationInfo = {
        modifiedLines: [],
        removedLines: [],
        addedLines: [],
        unchangedLines: [],
    }

    for (const lineInfo of lineInfos) {
        switch (lineInfo.type) {
            case 'unchanged':
                decorationInfo.unchangedLines.push(lineInfo)
                break
            case 'added':
                decorationInfo.addedLines.push(lineInfo)
                break
            case 'removed':
                decorationInfo.removedLines.push(lineInfo)
                break
            case 'modified':
                decorationInfo.modifiedLines.push(lineInfo as ModifiedLineInfo)
                break
        }
    }

    return decorationInfo
}

/**
 * Computes the diff operations between two arrays of lines.
 */
function computeDiffOperations(originalLines: string[], modifiedLines: string[]): DecorationLineInfo[] {
    // Compute the list of diff chunks between the original and modified lines.
    // Each diff chunk is a tuple representing the range of changes:
    // [originalStart, originalEnd, modifiedStart, modifiedEnd]
    const diffs = diff(originalLines, modifiedLines)

    // Initialize an array to collect information about each line and its change type.
    const lineInfos: DecorationLineInfo[] = []

    // Initialize indices to keep track of the current position in the original and modified lines.
    let originalIndex = 0 // Current index in originalLines
    let modifiedIndex = 0 // Current index in modifiedLines

    // Iterate over each diff chunk to process changes.
    for (const [originalStart, originalEnd, modifiedStart, modifiedEnd] of diffs) {
        // Process unchanged lines before the current diff
        while (originalIndex < originalStart && modifiedIndex < modifiedStart) {
            lineInfos.push({
                type: 'unchanged',
                originalLineNumber: originalIndex,
                modifiedLineNumber: modifiedIndex,
                text: modifiedLines[modifiedIndex],
            })
            originalIndex++
            modifiedIndex++
        }

        // Calculate the number of deletions and insertions in the current diff chunk.
        const numDeletions = originalEnd - originalStart // Number of lines deleted from originalLines
        const numInsertions = modifiedEnd - modifiedStart // Number of lines added to modifiedLines

        let i = 0

        // Handle modifications
        while (i < Math.min(numDeletions, numInsertions)) {
            const originalLine = originalLines[originalStart + i]
            const modifiedLine = modifiedLines[modifiedStart + i]

            if (originalLine !== modifiedLine) {
                lineInfos.push(
                    createModifiedLineInfo({
                        originalLineNumber: originalStart + i,
                        modifiedLineNumber: modifiedStart + i,
                        originalText: originalLine,
                        modifiedText: modifiedLine,
                    })
                )
            } else {
                lineInfos.push({
                    type: 'unchanged',
                    originalLineNumber: originalStart + i,
                    modifiedLineNumber: modifiedStart + i,
                    text: modifiedLine,
                })
            }
            i++
        }

        // Process remaining deletions (removed lines)
        for (let j = i; j < numDeletions; j++) {
            lineInfos.push({
                type: 'removed',
                originalLineNumber: originalStart + j,
                text: originalLines[originalStart + j],
            })
        }

        // Process remaining insertions (added lines)
        for (let j = i; j < numInsertions; j++) {
            lineInfos.push({
                type: 'added',
                modifiedLineNumber: modifiedStart + j,
                text: modifiedLines[modifiedStart + j],
            })
        }

        // Update the indices to the end of the current diff chunk.
        originalIndex = originalEnd
        modifiedIndex = modifiedEnd
    }

    // Process any remaining unchanged lines after the last diff chunk.
    while (originalIndex < originalLines.length && modifiedIndex < modifiedLines.length) {
        lineInfos.push({
            type: 'unchanged',
            originalLineNumber: originalIndex,
            modifiedLineNumber: modifiedIndex,
            text: modifiedLines[modifiedIndex],
        })
        originalIndex++
        modifiedIndex++
    }

    return lineInfos
}

/**
 * Creates a ModifiedLineInfo object by computing insertions and deletions within a line.
 */
function createModifiedLineInfo({
    originalLineNumber,
    modifiedLineNumber,
    originalText,
    modifiedText,
}: {
    originalLineNumber: number
    modifiedLineNumber: number
    originalText: string
    modifiedText: string
}): ModifiedLineInfo {
    const oldChunks = splitLineIntoChunks(originalText)
    const newChunks = splitLineIntoChunks(modifiedText)
    const lineChanges = computeLineChanges({ oldChunks, newChunks, lineNumber: modifiedLineNumber })

    return {
        type: 'modified',
        originalLineNumber,
        modifiedLineNumber,
        oldText: originalText,
        newText: modifiedText,
        changes: lineChanges,
    }
}

/**
 * Computes insertions and deletions within a line.
 */
function computeLineChanges({
    oldChunks,
    newChunks,
    lineNumber,
}: { oldChunks: string[]; newChunks: string[]; lineNumber: number }): LineChange[] {
    const changes: LineChange[] = []
    const chunkDiffs = diff(oldChunks, newChunks)

    let oldIndex = 0
    let newIndex = 0
    let oldOffset = 0

    for (const [oldStart, oldEnd, newStart, newEnd] of chunkDiffs) {
        // Process unchanged chunks before this diff
        while (oldIndex < oldStart && newIndex < newStart) {
            const unchangedText = oldChunks[oldIndex]
            const unchangedStartOffset = oldOffset
            oldOffset += unchangedText.length

            if (unchangedText) {
                const unchangedRange = new vscode.Range(
                    lineNumber,
                    unchangedStartOffset,
                    lineNumber,
                    oldOffset
                )
                changes.push({
                    type: 'unchanged',
                    range: unchangedRange,
                    text: unchangedText,
                })
            }

            oldIndex++
            newIndex++
        }

        // Process deletions from oldChunks (merge adjacent deletions)
        if (oldStart < oldEnd) {
            let deletionText = ''
            const deletionStartOffset = oldOffset
            for (let i = oldStart; i < oldEnd; i++) {
                deletionText += oldChunks[i]
                oldOffset += oldChunks[i].length
                oldIndex++
            }

            if (deletionText) {
                const deleteRange = new vscode.Range(
                    lineNumber,
                    deletionStartOffset,
                    lineNumber,
                    oldOffset
                )
                changes.push({
                    type: 'delete',
                    range: deleteRange,
                    text: deletionText,
                })
            }
        }

        // Process insertions from newChunks (merge adjacent insertions)
        if (newStart < newEnd) {
            let insertionText = ''
            const insertionStartOffset = oldOffset
            for (let i = newStart; i < newEnd; i++) {
                insertionText += newChunks[i]
                newIndex++
            }

            if (insertionText) {
                const insertRange = new vscode.Range(
                    lineNumber,
                    insertionStartOffset,
                    lineNumber,
                    insertionStartOffset // Zero-width range
                )

                changes.push({
                    type: 'insert',
                    range: insertRange,
                    text: insertionText,
                })
            }
        }
    }

    // Process any remaining unchanged chunks after the last diff
    while (oldIndex < oldChunks.length && newIndex < newChunks.length) {
        const unchangedText = oldChunks[oldIndex]
        const unchangedStartOffset = oldOffset
        oldOffset += unchangedText.length

        if (unchangedText) {
            const unchangedRange = new vscode.Range(
                lineNumber,
                unchangedStartOffset,
                lineNumber,
                oldOffset
            )
            changes.push({
                type: 'unchanged',
                range: unchangedRange,
                text: unchangedText,
            })
        }

        oldIndex++
        newIndex++
    }

    return changes
}

/**
 * Splits a line into chunks for fine-grained diffing.
 * Uses word boundaries, spaces and non-alphanumeric characters for splitting.
 */
export function splitLineIntoChunks(line: string): string[] {
    // Split line into words, consecutive spaces and punctuation marks
    return line.match(/(\w+|\s+|\W)/g) || []
}
