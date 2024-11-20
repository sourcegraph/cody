import { diff } from 'fast-myers-diff'
import { range, zip } from 'lodash'
import {lines} from '../../completions/text-processing';
import {DecorationLineType, DecorationLineInformation, DecorationInformation} from './decorators/base';

/**
 * Represents a line that was preserved (either modified or unchanged) between two versions of text,
 * tracking both its line number in the before and after states
 */
export interface PreservedLine {
    /** The line number in the original text */
    oldNumber: number
    /** The line number in the modified text */
    newNumber: number
}

/**
 * Represents the ranges of text that were modified between two versions
 * Replace the text between from1 and to1 in the original text with the text between from2 and to2 in the modified text
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
    modifiedLines: PreservedLine[]
    /** Line numbers that were added in the new version */
    addedLines: number[]
    /** Line numbers that were removed from the original version */
    removedLines: number[]
    /** Line numbers that were unchanged between the original and modified versions */
    unchangedLines: PreservedLine[]
}


export function getDecorationInformation(currentFileText: string, predictedFileText: string): DecorationInformation {
    const oldLines = lines(currentFileText)
    const newLines = lines(predictedFileText)
    const { modifiedLines, removedLines, addedLines, unchangedLines } = getLineLevelDiff(oldLines, newLines)
    const oldLinesChunks = oldLines.map(line => splitLineIntoChunks(line))
    const newLinesChunks = newLines.map(line => splitLineIntoChunks(line))

    const decorationLineInformation: DecorationLineInformation[] = []
    for (const line of removedLines) {
        decorationLineInformation.push(getDecorationInformationForRemovedLine(line, oldLines[line]))
    }
    for (const line of addedLines) {
        decorationLineInformation.push(getDecorationInformationForAddedLine(line, newLines[line]))
    }
    for (const modifiedLine of modifiedLines) {
        const modifiedRanges = getModifiedRangesForLine(
            oldLinesChunks[modifiedLine.oldNumber],
            newLinesChunks[modifiedLine.newNumber]
        )
        // Modified ranges are based on the chunks of the original text, which could be char level or word level
        // Adjust the ranges to get the modified ranges in terms of the original text
        const adjustedModifiedRanges = modifiedRanges.map(range => ({
            from1: getCharacterOffsetFromChunks(oldLinesChunks[modifiedLine.oldNumber], range.from1),
            to1: getCharacterOffsetFromChunks(oldLinesChunks[modifiedLine.oldNumber], range.to1),
            from2: getCharacterOffsetFromChunks(newLinesChunks[modifiedLine.newNumber], range.from2),
            to2: getCharacterOffsetFromChunks(newLinesChunks[modifiedLine.newNumber], range.to2),
        }))

        decorationLineInformation.push({
            lineType: DecorationLineType.Modified,
            oldLineNumber: modifiedLine.oldNumber,
            newLineNumber: modifiedLine.newNumber,
            oldText: oldLines[modifiedLine.oldNumber],
            newText: newLines[modifiedLine.newNumber],
            modifiedRanges: adjustedModifiedRanges,
        })
    }
    for (const unchangedLine of unchangedLines) {
        decorationLineInformation.push(getDecorationInformationForUnchangedLine(
            unchangedLine.oldNumber,
            unchangedLine.newNumber,
            oldLines[unchangedLine.oldNumber]
        ))
    }
    return {
        lines: decorationLineInformation,
        oldLines,
        newLines,
    }
}

function getDecorationInformationForUnchangedLine(
    oldLineNumber: number,
    newLineNumber: number,
    text: string
): DecorationLineInformation {
    return {
        lineType: DecorationLineType.Unchanged,
        oldLineNumber,
        newLineNumber,
        oldText: text,
        newText: text,
        modifiedRanges: [],
    }
}

function getDecorationInformationForAddedLine(
    newLineNumber: number,
    text: string
): DecorationLineInformation {
    return {
        lineType: DecorationLineType.Added,
        oldLineNumber: null,
        newLineNumber,
        oldText: '',
        newText: text,
        modifiedRanges: [{ from1: 0, to1: 0, from2: 0, to2: text.length }],
    }
}

function getDecorationInformationForRemovedLine(
    oldLineNumber: number,
    text: string
): DecorationLineInformation {
    return {
        lineType: DecorationLineType.Removed,
        oldLineNumber,
        newLineNumber: null,
        oldText: text,
        newText: '',
        modifiedRanges: [{ from1: 0, to1: text.length, from2: 0, to2: 0 }],
    }
}

export function getLineLevelDiff(
    oldLines: string[],
    newLines: string[]
): LineLevelDiff {
    const modifiedLines: PreservedLine[] = []
    const addedLines: number[] = []
    const removedLines: number[] = []

    const unchangedLinesOldLineNumbers: number[] = []
    const unchangedLinesNewLineNumbers: number[] = []
    let lastChangedOldLine = -1 // Dummy value to indicate the last changed old line
    let lastChangedNewLine = -1 // Dummy value to indicate the last changed new line

    for (const [from1, to1, from2, to2] of diff(oldLines, newLines)) {
        // Deleted or modify the lines from from1 to to1
        // Added or modify the lines from from2 to to2
        // Greedily match the lines min (to1 - from1, to2 - from2) as the modified lines and add the rest to removed or added
        // todo (hitesh): Improve the logic to handle the cases when fully removed or added lines can be at the start
        const minLength = Math.min(to1 - from1, to2 - from2)
        for (let i = 0; i < minLength; i++) {
            modifiedLines.push({ oldNumber: from1 + i, newNumber: from2 + i })
        }
        if (to1 - from1 > minLength) {
            removedLines.push(...range(from1 + minLength, to1))
        }
        if (to2 - from2 > minLength) {
            addedLines.push(...range(from2 + minLength, to2))
        }
        if (from1 > lastChangedOldLine + 1) {
            unchangedLinesOldLineNumbers.push(...range(lastChangedOldLine + 1, from1))
        }
        if (from2 > lastChangedNewLine + 1) {
            unchangedLinesNewLineNumbers.push(...range(lastChangedNewLine + 1, from2))
        }
        lastChangedOldLine = to1 -1
        lastChangedNewLine = to2 - 1
    }
    if (lastChangedOldLine + 1 < oldLines.length) {
        unchangedLinesOldLineNumbers.push(...range(lastChangedOldLine + 1, oldLines.length))
    }
    if (lastChangedNewLine + 1 < newLines.length) {
        unchangedLinesNewLineNumbers.push(...range(lastChangedNewLine + 1, newLines.length))
    }
    const unchangedLines: PreservedLine[] = []
    for (const [oldLineNumber, newLineNumber] of zip(unchangedLinesOldLineNumbers, unchangedLinesNewLineNumbers)) {
        if (oldLineNumber !== undefined && newLineNumber !== undefined) {
            unchangedLines.push({ oldNumber: oldLineNumber, newNumber: newLineNumber })
        }
    }
    return {
        modifiedLines,
        addedLines,
        removedLines,
        unchangedLines,
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

function getCharacterOffsetFromChunks(parts: string[], chunkIndex: number): number {
    return parts.slice(0, chunkIndex).reduce((acc: number, str: string) => acc + str.length, 0)
}
