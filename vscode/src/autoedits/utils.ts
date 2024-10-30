import * as vscode from 'vscode'
import { lines } from '../completions/text-processing'

export function fixFirstLineIndentation(source: string, target: string): string {
    // Check the first line indentation of source string and replaces in target string.
    const codeToRewriteLines = lines(source)
    const completionLines = lines(target)
    const firstLineMatch = codeToRewriteLines[0].match(/^(\s*)/)
    const firstLineIndentation = firstLineMatch ? firstLineMatch[1] : ''
    completionLines[0] = firstLineIndentation + completionLines[0].trimStart()
    const completion = completionLines.join('\n')
    return completion
}

/**
 * Split a string into lines, keeping the line endings.
 * @param s - The string to split.
 * @returns An array of lines.
 */
export function splitLinesKeepEnds(s: string): string[] {
    const pattern = /[^\r\n]*(?:\r\n|\n|\r|$)/g
    const lines = s.match(pattern) || []
    if (lines.length > 1 && lines[lines.length - 1] === '') {
        lines.pop()
    }
    return lines
}

/**
 * Maps each line in the original list to a new line number based on the given index and mapped value.
 *
 * This function iterates through the original list of lines and calculates a new line number for each line.
 * The calculation is based on the given index and mapped value. For lines before the given index, the new line number
 * is the mapped value minus the difference between the index and the current line number. For lines after the given index,
 * the new line number is the mapped value plus the difference between the current line number and the index. For the line
 * at the given index, the new line number is the mapped value.
 *
 * @param originalList - The original list of lines.
 * @param index - The index to base the mapping on.
 * @param mappedValue - The value to map the lines to.
 * @returns An array of new line numbers corresponding to each line in the original list.
 */
export function mapLinesToOriginalLineNo(
    originalList: string[],
    index: number,
    mappedValue: number
): number[] {
    const result: number[] = []
    for (let i = 0; i < originalList.length; i++) {
        if (i < index) {
            result.push(mappedValue - (index - i))
        } else if (i > index) {
            result.push(mappedValue + (i - index))
        } else {
            result.push(mappedValue)
        }
    }
    return result
}

// Helper function to zip two arrays together
export function zip<T, U>(arr1: T[], arr2: U[]): [T, U][] {
    const length = Math.min(arr1.length, arr2.length)
    return Array.from({ length }, (_, i) => [arr1[i], arr2[i]])
}

export function trimExtraNewLineCharsFromSuggestion(
    predictedText: string,
    codeToRewrite: string
): string {
    const codeToRewriteChars = getNumberOfNewLineCharsAtSuffix(codeToRewrite)
    const predictedTextChars = getNumberOfNewLineCharsAtSuffix(predictedText)
    const extraChars = predictedTextChars - codeToRewriteChars
    if (extraChars <= 0) {
        return predictedText
    }
    return predictedText.slice(0, -extraChars)
}

function getNumberOfNewLineCharsAtSuffix(text: string): number {
    const match = text.match(/\n+$/)
    return match ? match[0].length : 0
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
