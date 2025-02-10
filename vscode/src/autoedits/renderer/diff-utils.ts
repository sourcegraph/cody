import { diff } from 'fast-myers-diff'
import * as uuid from 'uuid'
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
                id: uuid.v4(),
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
                    id: uuid.v4(),
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
                id: uuid.v4(),
                type: 'removed',
                originalLineNumber: originalStart + j,
                text: originalLines[originalStart + j],
            })
        }

        // Process remaining insertions (added lines)
        for (let j = i; j < numInsertions; j++) {
            lineInfos.push({
                id: uuid.v4(),
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
            id: uuid.v4(),
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
    const lineChanges = computeLineChanges({
        oldChunks,
        newChunks,
        originalLineNumber,
        modifiedLineNumber,
    })

    return {
        id: uuid.v4(),
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
    originalLineNumber,
    modifiedLineNumber,
}: {
    oldChunks: string[]
    newChunks: string[]
    originalLineNumber: number
    modifiedLineNumber: number
}): LineChange[] {
    const changes: LineChange[] = []
    const chunkDiffs = diff(oldChunks, newChunks)

    let originalOffset = 0 // Position in the original line's text
    let modifiedOffset = 0 // Position in the modified line's text

    let oldIndex = 0
    let newIndex = 0

    function pushUnchangedUntil(targetOldIndex: number, targetNewIndex: number) {
        while (oldIndex < targetOldIndex && newIndex < targetNewIndex) {
            const unchangedText = oldChunks[oldIndex]
            if (unchangedText) {
                const startOriginal = originalOffset
                const startModified = modifiedOffset
                const length = unchangedText.length

                originalOffset += length
                modifiedOffset += length

                changes.push({
                    id: uuid.v4(),
                    type: 'unchanged',
                    text: unchangedText,
                    originalRange: new vscode.Range(
                        originalLineNumber,
                        startOriginal,
                        originalLineNumber,
                        originalOffset
                    ),
                    modifiedRange: new vscode.Range(
                        modifiedLineNumber,
                        startModified,
                        modifiedLineNumber,
                        modifiedOffset
                    ),
                })
            }
            oldIndex++
            newIndex++
        }
    }

    for (const [oldStart, oldEnd, newStart, newEnd] of chunkDiffs) {
        // Add unchanged chunks before this diff hunk
        pushUnchangedUntil(oldStart, newStart)

        const deletionText = oldChunks.slice(oldStart, oldEnd).join('')
        const insertionText = newChunks.slice(newStart, newEnd).join('')

        oldIndex = oldEnd
        newIndex = newEnd

        if (!deletionText && !insertionText) {
            // No changes, continue
            continue
        }

        // Identify common whitespace prefix
        let prefixLength = 0
        while (
            prefixLength < deletionText.length &&
            prefixLength < insertionText.length &&
            deletionText[prefixLength] === insertionText[prefixLength] &&
            /\s/.test(deletionText[prefixLength])
        ) {
            prefixLength++
        }

        // Identify common whitespace suffix
        let suffixLength = 0
        while (
            suffixLength < deletionText.length - prefixLength &&
            suffixLength < insertionText.length - prefixLength &&
            deletionText[deletionText.length - 1 - suffixLength] ===
                insertionText[insertionText.length - 1 - suffixLength] &&
            /\s/.test(deletionText[deletionText.length - 1 - suffixLength])
        ) {
            suffixLength++
        }

        // Handle unchanged prefix
        if (prefixLength > 0) {
            const unchangedText = deletionText.slice(0, prefixLength)
            const startOriginal = originalOffset
            const startModified = modifiedOffset

            originalOffset += prefixLength
            modifiedOffset += prefixLength

            changes.push({
                id: uuid.v4(),
                type: 'unchanged',
                text: unchangedText,
                originalRange: new vscode.Range(
                    originalLineNumber,
                    startOriginal,
                    originalLineNumber,
                    originalOffset
                ),
                modifiedRange: new vscode.Range(
                    modifiedLineNumber,
                    startModified,
                    modifiedLineNumber,
                    modifiedOffset
                ),
            })
        }

        // Handle deletion core
        const deletionCore = deletionText.slice(prefixLength, deletionText.length - suffixLength)
        if (deletionCore) {
            const startOriginal = originalOffset
            const startModified = modifiedOffset

            originalOffset += deletionCore.length
            // modifiedOffset does not advance for deletion

            changes.push({
                id: uuid.v4(),
                type: 'delete',
                text: deletionCore,
                originalRange: new vscode.Range(
                    originalLineNumber,
                    startOriginal,
                    originalLineNumber,
                    originalOffset
                ),
                modifiedRange: new vscode.Range(
                    modifiedLineNumber,
                    startModified,
                    modifiedLineNumber,
                    startModified
                ),
            })
        }

        // Handle insertion core
        const insertionCore = insertionText.slice(prefixLength, insertionText.length - suffixLength)
        if (insertionCore) {
            const startOriginal = originalOffset
            const startModified = modifiedOffset

            modifiedOffset += insertionCore.length
            // originalOffset does not advance for insertion

            changes.push({
                id: uuid.v4(),
                type: 'insert',
                text: insertionCore,
                originalRange: new vscode.Range(
                    originalLineNumber,
                    startOriginal,
                    originalLineNumber,
                    startOriginal
                ),
                modifiedRange: new vscode.Range(
                    modifiedLineNumber,
                    startModified,
                    modifiedLineNumber,
                    modifiedOffset
                ),
            })
        }

        // Handle unchanged suffix
        if (suffixLength > 0) {
            const unchangedText = deletionText.slice(deletionText.length - suffixLength)
            const startOriginal = originalOffset
            const startModified = modifiedOffset

            originalOffset += suffixLength
            modifiedOffset += suffixLength

            changes.push({
                id: uuid.v4(),
                type: 'unchanged',
                text: unchangedText,
                originalRange: new vscode.Range(
                    originalLineNumber,
                    startOriginal,
                    originalLineNumber,
                    originalOffset
                ),
                modifiedRange: new vscode.Range(
                    modifiedLineNumber,
                    startModified,
                    modifiedLineNumber,
                    modifiedOffset
                ),
            })
        }
    }

    // Handle any remaining unchanged chunks after the last diff hunk
    while (oldIndex < oldChunks.length && newIndex < newChunks.length) {
        const unchangedText = oldChunks[oldIndex]
        if (unchangedText) {
            const startOriginal = originalOffset
            const startModified = modifiedOffset
            const length = unchangedText.length

            originalOffset += length
            modifiedOffset += length

            changes.push({
                id: uuid.v4(),
                type: 'unchanged',
                text: unchangedText,
                originalRange: new vscode.Range(
                    originalLineNumber,
                    startOriginal,
                    originalLineNumber,
                    originalOffset
                ),
                modifiedRange: new vscode.Range(
                    modifiedLineNumber,
                    startModified,
                    modifiedLineNumber,
                    modifiedOffset
                ),
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
function splitLineIntoChunks(line: string): string[] {
    // Split line into words, consecutive spaces and punctuation marks
    return line.match(/(\w+|\s+|\W)/g) || []
}

/**
 * A generic helper for summing up `item.text.length` in an array of objects with a `text` field.
 */
function sumTextLengths<T extends { text: string }>(items: T[]): number {
    return items.reduce((total, { text }) => total + text.length, 0)
}

export interface DecorationStats {
    modifiedLines: number
    removedLines: number
    addedLines: number
    unchangedLines: number
    addedChars: number
    removedChars: number
    unchangedChars: number
}

export function getDecorationStats({
    modifiedLines,
    removedLines,
    addedLines,
    unchangedLines,
}: DecorationInfo): DecorationStats {
    const added = sumTextLengths(addedLines)
    const removed = sumTextLengths(removedLines)
    const unchanged = sumTextLengths(unchangedLines)

    const charsStats = modifiedLines
        .flatMap(line => line.changes)
        .reduce(
            (acc, change) => {
                switch (change.type) {
                    case 'insert':
                        acc.added += change.text.length
                        break
                    case 'delete':
                        acc.removed += change.text.length
                        break
                    case 'unchanged':
                        acc.unchanged += change.text.length
                        break
                }
                return acc
            },
            { added, removed, unchanged }
        )

    return {
        modifiedLines: modifiedLines.length,
        removedLines: removedLines.length,
        addedLines: addedLines.length,
        unchangedLines: unchangedLines.length,
        addedChars: charsStats.added,
        removedChars: charsStats.removed,
        unchangedChars: charsStats.unchanged,
    }
}
