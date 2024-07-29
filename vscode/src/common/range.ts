import type { RangeData } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

export function toVSCodeRange(
    range?: RangeData | [{ line: number; character: number }, { line: number; character: number }]
): vscode.Range | undefined {
    if (!range) {
        return undefined
    }

    // HACK: Handle if the `vscode.Range` value was accidentally JSON-serialized as [start, end],
    // which `vscode.Range` instances do when JSON-serialized because of their `toJSON()` method
    // that misleading and not represented in the type system).
    if (Array.isArray(range)) {
        return new vscode.Range(range[0].line, range[0].character, range[1].line, range[1].character)
    }

    return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character)
}

/**
 * Checks if the outer range contains the inner range:
 * - The start of the outer range is less than or equal to the start of the inner range.
 * - The end of the outer range is greater than or equal to the end of the inner range.
 */
export function rangeContainsLines(outerRange: RangeData, innerRange: RangeData): boolean {
    return outerRange.start.line <= innerRange.start.line && outerRange.end.line >= innerRange.end.line
}

/**
 * Checks if both ranges are on the same lines.
 */
export function rangesOnSameLines(range1: RangeData, range2: RangeData): boolean {
    return range1.start?.line === range2.start?.line && range1.end?.line === range2.end?.line
}
