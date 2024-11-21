import { PromptString, ps } from '@sourcegraph/cody-shared'
import { displayPath } from '@sourcegraph/cody-shared/src/editor/displayPath'
import { structuredPatch } from 'diff'
import type * as vscode from 'vscode'
import type { DiffHunk, TextDocumentChange } from './base'

export interface GroupedTextDocumentChange {
    changes: TextDocumentChange[]
}

export function groupChangesForSimilarLinesTogether(
    changes: TextDocumentChange[]
): GroupedTextDocumentChange[] {
    if (changes.length === 0) {
        return []
    }
    const groupedChanges: GroupedTextDocumentChange[] = []
    let currentGroup: GroupedTextDocumentChange = {
        changes: [changes[0]],
    }
    for (let i = 1; i < changes.length; i++) {
        const change = changes[i]
        const lastChange = currentGroup.changes[currentGroup.changes.length - 1]
        if (shouldCombineChanges(lastChange, change)) {
            currentGroup.changes.push(change)
        } else {
            groupedChanges.push(currentGroup)
            currentGroup = {
                changes: [change],
            }
        }
    }
    if (currentGroup.changes.length > 0) {
        groupedChanges.push(currentGroup)
    }
    return groupedChanges
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
    const leastTime = Math.min(...hunks.map(h => h.leastEditTimestamp))
    const diffs = PromptString.join(
        hunks.map(h => h.diff),
        ps`\nthen\n`
    )
    return {
        leastEditTimestamp: leastTime,
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
