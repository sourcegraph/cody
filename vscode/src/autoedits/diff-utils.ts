import { diff } from 'fast-myers-diff'
import { range } from 'lodash'
import * as vscode from 'vscode'

/**
 * Represents a line that was modified between two versions of text,
 * tracking both its line number in the before and after states
 */
export interface ModifiedLine {
    /** The line number in the original text */
    beforeNumber: number
    /** The line number in the modified text */
    afterNumber: number
    beforeLine: string
    afterLine: string
}

/**
 * Represents the ranges of text that were modified between two versions
 */
export interface ModifiedRanges {
    /** Array of [start, end] positions for deleted ranges in the original text */
    deletedRanges: [number, number][]
    /** Array of [start, end] positions for added ranges in the modified text */
    addedRanges: [number, number][]
}

/**
 * Represents the differences between two texts at a line level,
 * tracking modified, added and removed lines
 */
interface LineLevelDiff {
    /** Lines that were modified between versions */
    modifiedLines: ModifiedLine[]
    /** Line numbers that were added in the new version */
    addedLines: number[]
    /** Line numbers that were removed from the original version */
    removedLines: number[]
}


export function getLineLevelDiff(currentFileLines: string[], predictedFileLines: string[]): LineLevelDiff {
    const modifiedLines: ModifiedLine[] = []
    const addedLines: number[] = []
    const removedLines: number[] = []

    for (const [from1, to1, from2, to2] of diff(currentFileLines, predictedFileLines)) {
        // Deleted or modify the lines from from1 to to1
        // Added or modify the lines from from2 to to2
        // Greedily match the lines min (to1 - from1, to2 - from2) as the modified lines and add the rest to removed or added
        // todo (hitesh): Improve the logic to handle the cases when fully removed or added lines can be at the start
        const minLength = Math.min(to1 - from1, to2 - from2)
        for (let i = 0; i < minLength; i++) {
            modifiedLines.push({ beforeNumber: from1 + i, afterNumber: from2 + i, beforeLine: currentFileLines[from1 + i], afterLine: predictedFileLines[from2 + i] })
        }
        if (to1 - from1 > minLength) {
            removedLines.push(...range(from1 + minLength, to1))
        }
        if (to2 - from2 > minLength) {
            addedLines.push(...range(from2 + minLength, to2))
        }
    }
    return {
        modifiedLines,
        addedLines,
        removedLines,
    }
}

export function getModifiedRangesForLine(before: string, after: string): ModifiedRanges {
    // todo (hitesh): Check examples and handle the word level diffs instead of character level
    const deletedRanges: [number, number][] = []
    const addedRanges: [number, number][] = []
    for (const [from1, to1, from2, to2] of diff(before, after)) {
        if (from1 !== to1) {
            deletedRanges.push([from1, to1])
        }
        if (from2 !== to2) {
            addedRanges.push([from2, to2])
        }
    }
    return { deletedRanges, addedRanges }
}

/**
 * Checks if the changes between current and predicted text only consist of added lines
 */
export function isPureAddedLines(currentFileText: string, predictedFileText: string): boolean {
    const currentLines = currentFileText.split('\n')
    const predictedLines = predictedFileText.split('\n')
    for (const [from1, to1, from2, to2] of diff(currentLines, predictedLines)) {
        if (to2 - to1 > from2 - from1) {
            return true
        }
    }
    return false
}

/**
 * Calculates the ranges of text that will be removed in the document
 */
export function calculateRemovedRanges(
    document: vscode.TextDocument,
    currentFileText: string,
    predictedFileText: string
): vscode.Range[] {
    const edits = diff(currentFileText, predictedFileText)
    const allRangesToRemove: vscode.Range[] = []
    for (const [from1, to1] of edits) {
        const startPos = document.positionAt(from1)
        const endPos = document.positionAt(to1)
        allRangesToRemove.push(new vscode.Range(startPos, endPos))
    }
    return combineRanges(allRangesToRemove, 0)
}

export function combineRanges(ranges: vscode.Range[], n: number): vscode.Range[] {
    if (ranges.length === 0) return []
    const sortedRanges = ranges.sort((a, b) =>
        a.start.line !== b.start.line
            ? a.start.line - b.start.line
            : a.start.character - b.start.character
    )

    const combinedRanges: vscode.Range[] = []
    let currentRange = sortedRanges[0]

    for (let i = 1; i < sortedRanges.length; i++) {
        const nextRange = sortedRanges[i]

        if (
            currentRange.end.line === nextRange.start.line &&
            (nextRange.start.character - currentRange.end.character <= n ||
                currentRange.intersection(nextRange))
        ) {
            currentRange = new vscode.Range(
                currentRange.start,
                nextRange.end.character > currentRange.end.character ? nextRange.end : currentRange.end
            )
        } else {
            combinedRanges.push(currentRange)
            currentRange = nextRange
        }
    }

    combinedRanges.push(currentRange)
    return combinedRanges
}
