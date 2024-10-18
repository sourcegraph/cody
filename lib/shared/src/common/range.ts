import { type PromptString, ps } from '../prompt/prompt-string'

/**
 * A range of text in a document. Unlike {@link vscode.Range}, this just contains the data. Do not
 * use {@link vscode.Range} when serializing to JSON because it serializes to an array `[start,
 * end]`, which is impossible to deserialize correctly without knowing that the value is for a
 * {@link vscode.Range}.
 *
 * The line and character numbers are 0-indexed.
 */
export interface RangeData {
    start: { line: number; character: number }
    end: { line: number; character: number }
}

/**
 * A specialization of RangeData such that character is always 0. This is a
 * 0-indexed line range [start, end).
 */
interface LineRangeData {
    start: { line: number; character: 0 }
    end: { line: number; character: 0 }
}

/**
 * Return the plain {@link RangeData} for a rich instance of the class {@link vscode.Range}.
 */
export function toRangeData<R extends RangeData>(range: R): RangeData
export function toRangeData<R extends RangeData>(range: R | undefined): RangeData | undefined
export function toRangeData(
    badVSCodeSerializedRange: [{ line: number; character: number }, { line: number; character: number }]
): RangeData
export function toRangeData<R extends RangeData>(
    range: R | [{ line: number; character: number }, { line: number; character: number }] | undefined
): RangeData | undefined {
    // HACK: Handle if the `vscode.Range` value was accidentally JSON-serialized as [start, end],
    // which `vscode.Range` instances do when JSON-serialized because of their `toJSON()` method
    // that misleading and not represented in the type system).
    const data = Array.isArray(range) ? { start: range[0], end: range[1] } : range

    return data
        ? {
              start: { line: data.start.line, character: data.start.character },
              end: { line: data.end.line, character: data.end.character },
          }
        : undefined
}

/**
 * Return the display text for the line range, such as `1-3` (meaning lines 1 through 3, which we
 * assume humans interpret as an inclusive range) or just `2` (meaning just line 2). Callers that
 * need the characters in the returned string should use {@link displayRange}.
 *
 * If the range ends on a line at character 0, it's assumed to only include the prior line.
 *
 * `RangeData` is 0-indexed but humans use 1-indexed line ranges.
 */
export function displayLineRange(range: RangeData): PromptString {
    const lineRange = expandToLineRange(range)
    const startLine = lineRange.start.line + 1
    const endLine = lineRange.end.line
    if (endLine === startLine) {
        return ps`${startLine}`
    }
    return ps`${startLine}-${endLine}`
}

/**
 * Returns range such that it is expanded to be the whole line (character is
 * always zero).
 */
export function expandToLineRange(range: RangeData): LineRangeData {
    const hasEndLineCharacters = range.end.line === range.start.line || range.end.character !== 0
    const endLine = range.end.line + (hasEndLineCharacters ? 1 : 0)
    return {
        start: { line: range.start.line, character: 0 },
        end: { line: endLine, character: 0 },
    }
}

/**
 * Return the display text for the range, such as `1:2-3:4` (meaning from character 2 on line 1 to
 * character 4 on line 3), `1:2-3` (meaning from character 2 to 3 on line 1), or `1:2` (meaning an
 * empty range that starts and ends at character 2 on line 1). Callers that need only the lines in
 * the returned string should use {@link displayLineRange}.
 *
 * `RangeData` is 0-indexed but humans use 1-indexed line ranges.
 */
export function displayRange(range: RangeData): PromptString {
    if (range.end.line === range.start.line) {
        if (range.end.character === range.start.character) {
            return ps`${range.start.line + 1}:${range.start.character + 1}`
        }
        return ps`${range.start.line + 1}:${range.start.character + 1}-${range.end.character + 1}`
    }
    return ps`${range.start.line + 1}:${range.start.character + 1}-${range.end.line + 1}:${
        range.end.character + 1
    }`
}

interface Position {
    line: number
    character: number
}

// Utility functions for Position comparison
function isPositionEqual(a: Position, b: Position): boolean {
    return a.line === b.line && a.character === b.character
}

function isPositionLessThan(a: Position, b: Position): boolean {
    return a.line < b.line || (a.line === b.line && a.character < b.character)
}

function isPositionGreaterThan(a: Position, b: Position): boolean {
    return a.line > b.line || (a.line === b.line && a.character > b.character)
}

function minPosition(a: Position, b: Position): Position {
    return isPositionLessThan(a, b) ? a : b
}

function maxPosition(a: Position, b: Position): Position {
    return isPositionGreaterThan(a, b) ? a : b
}

// RangeData comparison functions
export function isRangeEqual(a: RangeData, b: RangeData): boolean {
    return isPositionEqual(a.start, b.start) && isPositionEqual(a.end, b.end)
}

export function isRangeLessThan(a: RangeData, b: RangeData): boolean {
    return isPositionLessThan(a.end, b.start)
}

export function isRangeGreaterThan(a: RangeData, b: RangeData): boolean {
    return isPositionGreaterThan(a.start, b.end)
}

export function doRangesIntersect(a: RangeData, b: RangeData): boolean {
    return !(isRangeLessThan(a, b) || isRangeGreaterThan(a, b))
}

export function isRangeContained(inner: RangeData, outer: RangeData): boolean {
    return (
        (isPositionLessThan(outer.start, inner.start) || isPositionEqual(outer.start, inner.start)) &&
        (isPositionGreaterThan(outer.end, inner.end) || isPositionEqual(outer.end, inner.end))
    )
}

// checks if inner is wholly contained withing outer (i.e. not equal)
export const isRangeProperSubset = (inner: RangeData, outer: RangeData) =>
    isRangeContained(inner, outer) && !isRangeEqual(inner, outer)

export function mergeRanges(a: RangeData, b: RangeData): RangeData {
    if (!doRangesIntersect(a, b)) {
        throw new Error('Cannot merge ranges that do not intersect')
    }
    return {
        start: minPosition(a.start, b.start),
        end: maxPosition(a.end, b.end),
    }
}

export function compareRanges(a: RangeData, b: RangeData): -1 | 0 | 1 {
    if (isRangeEqual(a, b)) return 0
    if (isRangeLessThan(a, b)) return -1
    return 1
}
