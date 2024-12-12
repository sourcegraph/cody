import { PromptString } from '@sourcegraph/cody-shared'
import { displayPath } from '@sourcegraph/cody-shared/src/editor/displayPath'
import { structuredPatch } from 'diff'
import * as vscode from 'vscode'
import type { DiffHunk, TextDocumentChange, UnifiedPatchResponse } from './recent-edits-diff-strategy'

/**
 * Represents a group of text document changes with their range information.
 * The grouped changes are consecutive changes made in the document that should be treated as a single entity when computing diffs.
 * A group is contructed by combining the consecutive changes that have overlapping ranges.
 * i.e. If line number of `insertedRange` of the first change overlaps with the line number of `deletedRange` of the second change,
 * they are considered to be in the same group.
 *
 * @example
 * When typing "hello world" in a document, each character typed generates a separate change event.
 * These changes are grouped together as a single entity in this interface.
 * Please check the test cases for more examples.
 */
export interface TextDocumentChangeGroup {
    /** Array of individual text document changes in this group */
    changes: TextDocumentChange[]

    /**
     * The union of the inserted ranges of all changes in this group
     */
    insertedRange?: vscode.Range

    /**
     * The union of the replace ranges of all changes in this group
     */
    replacementRange?: vscode.Range
}

interface TextDocumentChangeWithRange {
    change: TextDocumentChange
    insertedRange: vscode.Range
    replacementRange: vscode.Range
}

/**
 * Groups consecutive text document changes together based on line overlap.
 * This function helps create more meaningful diffs by combining related changes that occur on overlapping lines.
 *
 * For example, when a user types multiple characters or performs multiple edits in the same lines of text,
 * these changes are grouped together as a single logical change instead of being treated as separate changes.
 *
 * @param documentChanges - Array of individual text document changes to be grouped
 * @returns Array of TextDocumentChangeGroup objects, each containing related changes and their combined line range
 */
export function groupOverlappingDocumentChanges(
    documentChanges: TextDocumentChange[]
): TextDocumentChangeGroup[] {
    const mergePredicate = (
        lastItem: TextDocumentChangeWithRange,
        currentItem: TextDocumentChangeWithRange
    ) => {
        const doLinesOverlap = doLineOverlapForRanges(
            lastItem.insertedRange,
            currentItem.replacementRange
        )
        const doTimeOverlap = lastItem.change.timestamp === currentItem.change.timestamp
        return doLinesOverlap || doTimeOverlap
    }

    return mergeDocumentChanges({
        items: documentChanges.map(change => ({
            change,
            insertedRange: change.insertedRange,
            replacementRange: change.change.range,
        })),
        mergePredicate,
        getChanges: item => [item.change],
    })
}

/**
 * Combines consecutive text document change groups that have non-overlapping line ranges.
 * The function can generally be called after `groupOverlappingDocumentChanges` to further consolidate changes.
 *
 * This function takes an array of `TextDocumentChangeGroup` objects and merges consecutive groups
 * where their line ranges do not overlap. By combining these non-overlapping groups, it creates
 * larger groups of changes that can be processed together, even if they affect different parts
 * of the document.
 *
 * @param groupedChanges - Array of `TextDocumentChangeGroup` objects to be combined.
 * @returns Array of `TextDocumentChangeGroup` objects where consecutive non-overlapping groups have been merged.
 */
export function groupNonOverlappingChangeGroups(
    groupedChanges: TextDocumentChangeGroup[]
): TextDocumentChangeGroup[] {
    const mergePredicate = (lastItem: TextDocumentChangeGroup, currentItem: TextDocumentChangeGroup) => {
        if (!lastItem.insertedRange || !currentItem.replacementRange) {
            return false
        }
        return !doLineOverlapForRanges(lastItem.insertedRange, currentItem.replacementRange)
    }

    return mergeDocumentChanges({
        items: groupedChanges,
        mergePredicate,
        getChanges: group => group.changes,
    })
}

/**
 * Merges document changes based on a predicate and extracts changes using a provided function.
 *
 * @param items - Array of objects containing insertedRange and replacementRange properties
 * @param mergePredicate - Function that determines if two ranges should be merged
 * @param getChanges - Function that extracts TextDocumentChange array from an item
 * @returns Array of TextDocumentChangeGroup objects containing merged changes and their ranges
 */
function mergeDocumentChanges<
    T extends { insertedRange?: vscode.Range; replacementRange?: vscode.Range },
>(args: {
    items: T[]
    mergePredicate: (a: T, b: T) => boolean
    getChanges: (item: T) => TextDocumentChange[]
}): TextDocumentChangeGroup[] {
    if (args.items.length === 0) {
        return []
    }

    const mergedGroups = groupConsecutiveItemsByPredicate(args.items, (lastItem, currentItem) => {
        return args.mergePredicate(lastItem, currentItem)
    })

    return mergedGroups
        .filter(group => group.length > 0)
        .map(group => ({
            changes: group.flatMap(item => args.getChanges(item)),
            insertedRange: getRangeUnion(group.map(item => item.insertedRange)),
            replacementRange: getRangeUnion(group.map(item => item.replacementRange)),
        }))
}

export function getRangeUnion(ranges: (vscode.Range | undefined)[]): vscode.Range | undefined {
    const validRanges = ranges.filter((range): range is vscode.Range => range !== undefined)
    if (validRanges.length === 0) {
        return undefined
    }
    let start = validRanges[0].start
    let end = validRanges[0].end
    for (const range of validRanges) {
        start = start.isBefore(range.start) ? start : range.start
        end = end.isAfter(range.end) ? end : range.end
    }
    return new vscode.Range(start, end)
}

/**
 * Utility function to combine consecutive items in an array based on a predicate.
 */
export function groupConsecutiveItemsByPredicate<T>(
    items: T[],
    shouldGroup: (a: T, b: T) => boolean
): T[][] {
    return items.reduce<T[][]>((groups, item) => {
        if (groups.length === 0) {
            groups.push([item])
        } else {
            const lastGroup = groups[groups.length - 1]
            const lastItem = lastGroup[lastGroup.length - 1]
            if (shouldGroup(lastItem, item)) {
                lastGroup.push(item)
            } else {
                groups.push([item])
            }
        }
        return groups
    }, [])
}

/**
 * Formats a diff hunk into a custom string representation.
 * @param hunk - The diff hunk to format
 * @param shouldAddLineNumbersForDiff - Whether to include line numbers in the output
 * @param shouldTrimSurroundingContextLines - Whether to trim context lines around modifications
 * @returns A formatted string representing the diff hunk, with optional line numbers and context trimming
 */
function getCustomDiffFormatForHunk(
    hunk: Diff.Hunk,
    shouldAddLineNumbersForDiff: boolean,
    shouldTrimSurroundingContextLines: boolean
): string {
    const lines = []
    let oldLineNumber = hunk.oldStart
    let newLineNumber = hunk.newStart
    let firstModificationIndex = hunk.lines.length
    let lastModificationIndex = 0

    for (const [i, line] of hunk.lines.entries()) {
        if (line.length === 0) {
            continue
        }

        const lineType = getLineType(line)
        const linePrefix = getLinePrefixForCustomLineFormat(
            line,
            lineType === LineType.Deleted ? oldLineNumber : newLineNumber,
            shouldAddLineNumbersForDiff
        )
        if (lineType === LineType.Deleted || lineType === LineType.Added) {
            firstModificationIndex = Math.min(firstModificationIndex, i)
            lastModificationIndex = Math.max(lastModificationIndex, i)
        }

        if (lineType === LineType.Deleted) {
            oldLineNumber++
        } else if (lineType === LineType.Added) {
            newLineNumber++
        } else if (lineType === LineType.Context) {
            oldLineNumber++
            newLineNumber++
        }
        if (
            lineType === LineType.Deleted ||
            lineType === LineType.Added ||
            lineType === LineType.Context
        ) {
            lines.push(`${linePrefix}${line.slice(1)}`)
        }
    }

    return shouldTrimSurroundingContextLines
        ? lines.slice(firstModificationIndex, lastModificationIndex + 1).join('\n')
        : lines.join('\n')
}

function getLineType(line: string): LineType {
    if (line[0] === '-') {
        return LineType.Deleted
    }
    if (line[0] === '+') {
        return LineType.Added
    }
    if (line[0] === ' ') {
        return LineType.Context
    }
    return LineType.Other
}

function getLinePrefixForCustomLineFormat(
    line: string,
    lineNumber: number,
    shouldAddLineNumbersForDiff: boolean
): string {
    if (shouldAddLineNumbersForDiff) {
        return `${lineNumber}${line[0]}| `
    }
    return line[0]
}

export function computeCustomDiffFormat(
    uri: vscode.Uri,
    originalContent: string,
    modifiedContent: string,
    numContextLines: number,
    shouldAddLineNumbersForDiff: boolean,
    shouldTrimSurroundingContextLines: boolean
): PromptString {
    const hunkDiffs = []
    const filename = displayPath(uri)
    const patch = structuredPatch(
        `a/${filename}`,
        `b/${filename}`,
        originalContent,
        modifiedContent,
        '',
        '',
        { context: numContextLines }
    )
    for (const hunk of patch.hunks) {
        const diffString = getCustomDiffFormatForHunk(
            hunk,
            shouldAddLineNumbersForDiff,
            shouldTrimSurroundingContextLines
        )
        hunkDiffs.push(diffString)
    }
    const gitDiff = PromptString.fromStructuredGitDiff(uri, hunkDiffs.join('\nthen\n'))
    return gitDiff
}

export function getUnifiedDiffHunkFromTextDocumentChange(params: {
    uri: vscode.Uri
    oldContent: string
    changes: TextDocumentChange[]
    shouldAddLineNumbersForDiff: boolean
    contextLines: number
    shouldTrimSurroundingContextLines: boolean
}): UnifiedPatchResponse {
    const newContent = applyTextDocumentChanges(
        params.oldContent,
        params.changes.map(c => c.change)
    )
    const diff =
        params.shouldAddLineNumbersForDiff || params.shouldTrimSurroundingContextLines
            ? computeCustomDiffFormat(
                  params.uri,
                  params.oldContent,
                  newContent,
                  params.contextLines,
                  params.shouldAddLineNumbersForDiff,
                  params.shouldTrimSurroundingContextLines
              )
            : PromptString.fromGitDiff(params.uri, params.oldContent, newContent)

    return {
        uri: params.uri,
        newContent,
        diff,
        latestEditTimestamp: Math.max(...params.changes.map(c => c.timestamp)),
    }
}

export function divideGroupedChangesIntoShortTermAndLongTerm(params: {
    changes: TextDocumentChangeGroup[]
    minEvents: number
    minTimeMs: number
}): {
    shortTermChanges: TextDocumentChangeGroup[]
    longTermChanges: TextDocumentChangeGroup[]
} {
    const currentTimeStamp = Date.now()

    let longTermChangeIndex = params.changes.length - 1
    while (longTermChangeIndex >= 0) {
        const group = params.changes[longTermChangeIndex]
        const timestamp = Math.min(...group.changes.map(c => c.timestamp))
        const timeDiff = currentTimeStamp - timestamp
        const eventCount = params.changes.length - longTermChangeIndex
        if (eventCount > params.minEvents && timeDiff > params.minTimeMs) {
            break
        }
        longTermChangeIndex--
    }
    const shortTermChanges = params.changes.slice(longTermChangeIndex + 1)
    const longTermChanges = params.changes.slice(0, longTermChangeIndex + 1)
    return {
        shortTermChanges,
        longTermChanges,
    }
}

export function combineTextDocumentGroups(groups: TextDocumentChangeGroup[]): TextDocumentChangeGroup {
    return {
        changes: groups.flatMap(g => g.changes),
        insertedRange: getRangeUnion(groups.map(g => g.insertedRange)),
        replacementRange: getRangeUnion(groups.map(g => g.replacementRange)),
    }
}

export function getDiffHunkFromUnifiedPatch(unifiedPatch: UnifiedPatchResponse): DiffHunk {
    return {
        uri: unifiedPatch.uri,
        latestEditTimestamp: unifiedPatch.latestEditTimestamp,
        diff: unifiedPatch.diff,
    }
}

export function applyTextDocumentChanges(
    content: string,
    changes: vscode.TextDocumentContentChangeEvent[]
): string {
    for (const change of changes) {
        content =
            content.slice(0, change.rangeOffset) +
            change.text +
            content.slice(change.rangeOffset + change.rangeLength)
    }
    return content
}

function doLineOverlapForRanges(a: vscode.Range, b: vscode.Range): boolean {
    return a.start.line <= b.end.line && a.end.line >= b.start.line
}
