import { PromptString } from '@sourcegraph/cody-shared'
import { displayPath } from '@sourcegraph/cody-shared/src/editor/displayPath'
import { structuredPatch } from 'diff'
import type * as vscode from 'vscode'
import type {
    DiffCalculationInput,
    DiffHunk,
    RecentEditsRetrieverDiffStrategy,
} from './recent-edits-diff-strategy'
import { applyTextDocumentChanges } from './utils'

/**
 * Generates a single unified diff patch that combines all changes
 * made to a document into one consolidated view.
 */
export class UnifiedDiffStrategyWithLineNumbers implements RecentEditsRetrieverDiffStrategy {
    public getDiffHunks(input: DiffCalculationInput): DiffHunk[] {
        const newContent = applyTextDocumentChanges(
            input.oldContent,
            input.changes.map(c => c.change)
        )
        const gitDiff = this.computeDiffWithLineNumbers(input.uri, input.oldContent, newContent)
        return [
            {
                diff: gitDiff,
                latestEditTimestamp: Math.max(...input.changes.map(c => c.timestamp)),
            },
        ]
    }

    private computeDiffWithLineNumbers(
        uri: vscode.Uri,
        originalContent: string,
        modifiedContent: string
    ): PromptString {
        const hunkDiffs = []
        const filename = displayPath(uri)
        const patch = structuredPatch(`a/${filename}`, `b/${filename}`, originalContent, modifiedContent)
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
