import { PromptString, ps } from '@sourcegraph/cody-shared'
import { displayPath } from '@sourcegraph/cody-shared/src/editor/displayPath'
import { structuredPatch } from 'diff'
import type * as vscode from 'vscode'
import type { DiffHunk, TextDocumentChange } from './base'

export interface GroupedTextDocumentChange {
    changes: TextDocumentChange[]
    changeStartLine: number
    changeEndLine: number
}

export function combineNonOverlappingLinesSchemaTogether(groupedChanges: GroupedTextDocumentChange[]): GroupedTextDocumentChange[] {
    const combinedChanges: GroupedTextDocumentChange[] = []
    if (groupedChanges.length === 0) {
        return combinedChanges
    }
    let currentActiveChanges: GroupedTextDocumentChange[] = [groupedChanges[0]]
    for (let i = 1; i < groupedChanges.length; i++) {
        const groupedChange = groupedChanges[i]
        if (shouldCombineGroupedChanges(currentActiveChanges[currentActiveChanges.length - 1], groupedChange)) {
            currentActiveChanges.push(groupedChange)
        } else {
            combinedChanges.push(flatCombinedGroupedChanges(currentActiveChanges))
            currentActiveChanges = [groupedChange]
        }
    }
    if (currentActiveChanges.length > 0) {
        combinedChanges.push(flatCombinedGroupedChanges(currentActiveChanges))
    }
    return combinedChanges
}

function flatCombinedGroupedChanges(changes: GroupedTextDocumentChange[]): GroupedTextDocumentChange {
    return {
        changes: changes.flatMap(change => change.changes),
        changeStartLine: Math.min(...changes.map(change => change.changeStartLine)),
        changeEndLine: Math.max(...changes.map(change => change.changeEndLine))
    }
}

function shouldCombineGroupedChanges(a: GroupedTextDocumentChange, b: GroupedTextDocumentChange): boolean {
    return !(a.changeStartLine <= b.changeEndLine && a.changeEndLine >= b.changeStartLine)
}


export function groupChangesForSimilarLinesTogether(
    changes: TextDocumentChange[]
): GroupedTextDocumentChange[] {
    if (changes.length === 0) {
        return []
    }
    const groupedChanges: GroupedTextDocumentChange[] = []
    let currentGroup: TextDocumentChange[] = [changes[0]]
    for (let i = 1; i < changes.length; i++) {
        const change = changes[i]
        const lastChange = currentGroup[currentGroup.length - 1]
        if (shouldCombineChanges(lastChange, change)) {
            currentGroup.push(change)
        } else {
            const range = getRangeValues(currentGroup)
            groupedChanges.push({
                changes: currentGroup,
                changeStartLine: range[0],
                changeEndLine: range[1],
            })
            currentGroup = [change]
        }
    }
    if (currentGroup.length > 0) {
        const range = getRangeValues(currentGroup)
        groupedChanges.push({
            changes: currentGroup,
            changeStartLine: range[0],
            changeEndLine: range[1],
        })
    }
    return groupedChanges
}


function getRangeValues(documentChanges: TextDocumentChange[]): [number, number] {
    let minRange = getMinRange(documentChanges[0].replacedRange, documentChanges[0].insertedRange)
    let maxRange = getMaxRange(documentChanges[0].replacedRange, documentChanges[0].insertedRange)
    for (let i = 1; i < documentChanges.length; i++) {
        const change = documentChanges[i]
        minRange = getMinRange(getMinRange(change.replacedRange, change.insertedRange), minRange)
        maxRange = getMaxRange(getMaxRange(change.replacedRange, change.insertedRange), maxRange)
    }
    return [minRange.start.line, maxRange.end.line]
}

function getMinRange(a: vscode.Range, b: vscode.Range): vscode.Range {
    return a.start.isBeforeOrEqual(b.start) ? a : b
}

function getMaxRange(a: vscode.Range, b: vscode.Range): vscode.Range {
    return a.end.isBeforeOrEqual(b.end) ? b : a
}

function shouldCombineChanges(lastChange: TextDocumentChange, change: TextDocumentChange): boolean {
    return (
        doesLinesOverlap(lastChange.replacedRange, change.change.range) ||
        doesLinesOverlap(lastChange.insertedRange, change.change.range)
    )
}

function doesLinesOverlap(a: vscode.Range, b: vscode.Range): boolean {
    return a.start.line <= b.end.line && a.end.line >= b.start.line
}

export function computeDiffWithLineNumbers(
    uri: vscode.Uri,
    originalContent: string,
    modifiedContent: string,
    numContextLines: number
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
        const diffString = getDiffStringForHunkWithLineNumbers(hunk)
        hunkDiffs.push(diffString)
    }
    const gitDiff = PromptString.fromStructuredGitDiff(uri, hunkDiffs.join('\nthen\n'))
    return gitDiff
}

export function combineDiffHunksFromSimilarFile(hunks: DiffHunk[]): DiffHunk[] {
    if (hunks.length === 0) {
        return []
    }
    const combinedHunks: DiffHunk[] = []
    let currentHunkList: DiffHunk[] = [hunks[0]]
    for (let i = 1; i < hunks.length; i++) {
        const hunk = hunks[i]
        const lastHunk = currentHunkList[currentHunkList.length - 1]
        if (shouldCombineHunks(hunk, lastHunk)) {
            currentHunkList.push(hunk)
        } else {
            combinedHunks.push(combineMultipleHunks(currentHunkList))
            currentHunkList = [hunk]
        }
    }
    if (currentHunkList.length > 0) {
        combinedHunks.push(combineMultipleHunks(currentHunkList))
    }
    return combinedHunks
}

function combineMultipleHunks(hunks: DiffHunk[]): DiffHunk {
    const lastestTime = Math.max(...hunks.map(h => h.latestEditTimestamp))
    const diffs = PromptString.join(
        hunks.map(h => h.diff),
        ps`\nthen\n`
    )
    return {
        uri: hunks[0].uri,
        latestEditTimestamp: lastestTime,
        diff: diffs,
    }
}

function shouldCombineHunks(hunk1: DiffHunk, hunk2: DiffHunk): boolean {
    return hunk1.uri.toString() === hunk2.uri.toString()
}

export function getDiffStringForHunkWithLineNumbers(hunk: Diff.Hunk): string {
    const lines = []
    let oldLineNumber = hunk.oldStart
    let newLineNumber = hunk.newStart
    for (const line of hunk.lines) {
        if (line.length === 0) {
            continue
        }
        if (line[0] === '-') {
            lines.push(`${oldLineNumber}${line[0]}| ${line.slice(1)}`)
            oldLineNumber++
        } else if (line[0] === '+') {
            lines.push(`${newLineNumber}${line[0]}| ${line.slice(1)}`)
            newLineNumber++
        } else if (line[0] === ' ') {
            lines.push(`${newLineNumber}${line[0]}| ${line.slice(1)}`)
            oldLineNumber++
            newLineNumber++
        }
    }
    return lines.join('\n')
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

export function getNewContentAfterApplyingRange(
    oldContent: string,
    change: vscode.TextDocumentContentChangeEvent
): string {
    return (
        oldContent.slice(0, change.rangeOffset) +
        change.text +
        oldContent.slice(change.rangeOffset + change.rangeLength)
    )
}
