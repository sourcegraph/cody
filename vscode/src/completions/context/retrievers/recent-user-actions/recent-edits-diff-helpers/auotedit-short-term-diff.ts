import { PromptString } from '@sourcegraph/cody-shared'
import { displayPath } from '@sourcegraph/cody-shared/src/editor/displayPath'
import { structuredPatch } from 'diff'
import type * as vscode from 'vscode'
import type {
    DiffCalculationInput,
    DiffHunk,
    RecentEditsRetrieverDiffStrategy,
    TextDocumentChange,
} from './recent-edits-diff-strategy'
import { applyTextDocumentChanges } from './utils'

/**
 * Generates a single unified diff patch that combines all changes
 * made to a document into one consolidated view.
 */
export class AutoeditWithShortTermDiffStrategy implements RecentEditsRetrieverDiffStrategy {
    private shortTermDiffWindowMs = 5 * 1000 // 5 seconds
    private longTermContextLines = 3
    private shortTermContextLines = 0

    public getDiffHunks(input: DiffCalculationInput): DiffHunk[] {
        const [shortTermChanges, longTermChanges] = this.divideChangesIntoWindows(input.changes)
        const shortTermHunks = this.getDiffHunksForChanges(
            input.uri,
            input.oldContent,
            shortTermChanges,
            this.shortTermContextLines
        )
        const longTermHunks = this.getDiffHunksForChanges(
            input.uri,
            input.oldContent,
            longTermChanges,
            this.longTermContextLines
        )
        return [...shortTermHunks, ...longTermHunks]
    }

    private getDiffHunksForChanges(
        uri: vscode.Uri,
        oldContent: string,
        changes: TextDocumentChange[],
        numContextLines: number
    ): DiffHunk[] {
        const newContent = applyTextDocumentChanges(
            oldContent,
            changes.map(c => c.change)
        )
        const gitDiff = this.computeDiffWithLineNumbers(uri, oldContent, newContent, numContextLines)
        return [
            {
                diff: gitDiff,
                latestEditTimestamp: Math.max(...changes.map(c => c.timestamp)),
            },
        ]
    }

    private divideChangesIntoWindows(
        changes: TextDocumentChange[]
    ): [TextDocumentChange[], TextDocumentChange[]] {
        // Divide the changes into 2 different windows, where the second window is the short term changes under 5 seconds
        const now = Date.now()
        const index = changes.findIndex(c => now - c.timestamp < this.shortTermDiffWindowMs)
        const shortTermChanges = changes.slice(0, index)
        const longTermChanges = changes.slice(index)
        return [shortTermChanges, longTermChanges]
    }

    private computeDiffWithLineNumbers(
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
            const diffString = this.getDiffStringForHunkWithLineNumbers(hunk)
            hunkDiffs.push(diffString)
        }
        const gitDiff = PromptString.fromStructuredGitDiff(uri, hunkDiffs.join('\nthen\n'))
        return gitDiff
    }

    private getDiffStringForHunkWithLineNumbers(hunk: Diff.Hunk): string {
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
}
