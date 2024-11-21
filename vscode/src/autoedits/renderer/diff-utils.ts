import { diff } from 'fast-myers-diff'
import * as vscode from 'vscode'

import type { DecorationInfo, DecorationLineInfo, LineChange, ModifiedLineInfo } from './decorators/base'

/**
 * Generates decoration information by computing the differences between two texts.
 *
 * @param originalText The original text content.
 * @param modifiedText The modified text content.
 * @returns Decoration information representing the differences.
 */
export function getDecorationInfo(originalText: string, modifiedText: string): DecorationInfo {
    const originalLines = originalText.split('\n')
    const modifiedLines = modifiedText.split('\n')

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
        // Process any unchanged lines before the current diff chunk begins.
        // These are lines that are identical in both files up to the point of the change.
        while (originalIndex < originalStart && modifiedIndex < modifiedStart) {
            lineInfos.push({
                type: 'unchanged',
                lineNumber: modifiedIndex,
                text: modifiedLines[modifiedIndex],
            })
            originalIndex++
            modifiedIndex++
        }

        // Calculate the number of deletions and insertions in the current diff chunk.
        const numDeletions = originalEnd - originalStart // Number of lines deleted from originalLines
        const numInsertions = modifiedEnd - modifiedStart // Number of lines added to modifiedLines

        // The minimum between deletions and insertions represents replacements (modified lines).
        // These are lines where content has changed but positions remain the same.
        const numReplacements = Math.min(numDeletions, numInsertions)

        // Process replacements: lines that have been modified.
        for (let i = 0; i < numReplacements; i++) {
            const modifiedLineInfo = createModifiedLineInfo({
                modifiedLineNumber: modifiedStart + i,
                originalText: originalLines[originalStart + i],
                modifiedText: modifiedLines[modifiedStart + i],
            })
            lineInfos.push(modifiedLineInfo)
        }

        // Process deletions: lines that were removed from the original text.
        for (let i = numReplacements; i < numDeletions; i++) {
            lineInfos.push({
                type: 'removed',
                lineNumber: originalStart + i, // Line number in the originalLines
                text: originalLines[originalStart + i],
            })
        }

        // Process insertions: lines that were added to the modified text.
        for (let i = numReplacements; i < numInsertions; i++) {
            lineInfos.push({
                type: 'added',
                lineNumber: modifiedStart + i, // Line number in the modifiedLines
                text: modifiedLines[modifiedStart + i],
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
            lineNumber: modifiedIndex,
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
    modifiedLineNumber,
    originalText,
    modifiedText,
}: {
    modifiedLineNumber: number
    originalText: string
    modifiedText: string
}): ModifiedLineInfo {
    const oldChunks = splitLineIntoChunks(originalText)
    const newChunks = splitLineIntoChunks(modifiedText)
    const lineChanges = computeLineChanges({ oldChunks, newChunks, lineNumber: modifiedLineNumber })

    return {
        type: 'modified',
        lineNumber: modifiedLineNumber,
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
    let newOffset = 0

    for (const [oldStart, oldEnd, newStart, newEnd] of chunkDiffs) {
        // Process unchanged chunks before this diff
        while (oldIndex < oldStart && newIndex < newStart) {
            oldOffset += oldChunks[oldIndex].length
            newOffset += newChunks[newIndex].length
            oldIndex++
            newIndex++
        }

        // Process deletions from oldChunks
        let deletionText = ''
        const deletionStartOffset = oldOffset
        for (let i = oldStart; i < oldEnd; i++) {
            deletionText += oldChunks[i]
            oldOffset += oldChunks[i].length
            oldIndex++
        }
        if (deletionText) {
            const deleteRange = new vscode.Range(lineNumber, deletionStartOffset, lineNumber, oldOffset)
            // Merge adjacent deletions
            const lastChange = changes[changes.length - 1]
            if (
                lastChange &&
                lastChange.type === 'delete' &&
                lastChange.range.end.isEqual(deleteRange.start)
            ) {
                lastChange.text += deletionText
                lastChange.range = new vscode.Range(lastChange.range.start, deleteRange.end)
            } else {
                changes.push({
                    type: 'delete',
                    range: deleteRange,
                    text: deletionText,
                })
            }
        }

        // Process insertions from newChunks
        let insertionText = ''
        const insertionStartOffset = newOffset
        for (let i = newStart; i < newEnd; i++) {
            insertionText += newChunks[i]
            newOffset += newChunks[i].length
            newIndex++
        }
        if (insertionText) {
            const insertRange = new vscode.Range(
                lineNumber,
                insertionStartOffset,
                lineNumber,
                insertionStartOffset + insertionText.length
            )
            // Merge adjacent insertions
            const lastChange = changes[changes.length - 1]
            if (
                lastChange &&
                lastChange.type === 'insert' &&
                lastChange.range.end.isEqual(insertRange.start)
            ) {
                lastChange.text += insertionText
                lastChange.range = new vscode.Range(lastChange.range.start, insertRange.end)
            } else {
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
        oldOffset += oldChunks[oldIndex].length
        newOffset += newChunks[newIndex].length
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
