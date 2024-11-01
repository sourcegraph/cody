import { diff } from 'fast-myers-diff'
import { range } from 'lodash'

/**
 * Represents a line that was modified between two versions of text,
 * tracking both its line number in the before and after states
 */
export interface ModifiedLine {
    /** The line number in the original text */
    beforeNumber: number
    /** The line number in the modified text */
    afterNumber: number
}

/**
 * Represents the ranges of text that were modified between two versions
 */
export interface ModifiedRange {
    /** The start position in the original text */
    from1: number
    /** The end position in the original text */
    to1: number
    /** The start position in the modified text */
    from2: number
    /** The end position in the modified text */
    to2: number
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

export function getLineLevelDiff(
    currentFileLines: string[],
    predictedFileLines: string[]
): LineLevelDiff {
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
            modifiedLines.push({ beforeNumber: from1 + i, afterNumber: from2 + i })
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

export function getModifiedRangesForLine(before: string[], after: string[]): ModifiedRange[] {
    const modifiedRanges: ModifiedRange[] = []
    for (const [from1, to1, from2, to2] of diff(before, after)) {
        modifiedRanges.push({ from1, to1, from2, to2 })
    }
    return modifiedRanges
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

export function splitLineIntoChunks(line: string): string[] {
    // Strategy 1: Split line into chars
    // return line.split('')
    // Strategy 2: Split line into words seperated by punctuations, white space etc.
    return line.split(/(?=[^a-zA-Z0-9])|(?<=[^a-zA-Z0-9])/)
}
