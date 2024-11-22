import * as vscode from 'vscode';
import {PromptString} from '@sourcegraph/cody-shared';
import {displayPath} from '@sourcegraph/cody-shared/src/editor/displayPath';
import {structuredPatch} from 'diff';

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
