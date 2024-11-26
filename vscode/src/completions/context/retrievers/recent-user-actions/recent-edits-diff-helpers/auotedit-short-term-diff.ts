import type { AutocompleteContextSnippetMetadataFields } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import type {
    DiffCalculationInput,
    DiffHunk,
    RecentEditsRetrieverDiffStrategy,
    TextDocumentChange,
} from './recent-edits-diff-strategy'
import { applyTextDocumentChanges, computeDiffWithLineNumbers } from './utils'

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
        const [shortTermHunks, shortTermNewContent] = this.getDiffHunksForChanges(
            input.uri,
            input.oldContent,
            shortTermChanges,
            this.shortTermContextLines
        )
        const [longTermHunks, _] = this.getDiffHunksForChanges(
            input.uri,
            shortTermNewContent,
            longTermChanges,
            this.longTermContextLines
        )
        return [shortTermHunks, longTermHunks]
    }

    private getDiffHunksForChanges(
        uri: vscode.Uri,
        oldContent: string,
        changes: TextDocumentChange[],
        numContextLines: number
    ): [DiffHunk, string] {
        const newContent = applyTextDocumentChanges(
            oldContent,
            changes.map(c => c.change)
        )
        const gitDiff = computeDiffWithLineNumbers(uri, oldContent, newContent, numContextLines)
        const diffHunk = {
            uri,
            diff: gitDiff,
            latestEditTimestamp: Math.max(...changes.map(c => c.timestamp)),
        }
        return [diffHunk, newContent]
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

    public getDiffStrategyMetadata(): AutocompleteContextSnippetMetadataFields {
        return {
            strategy: 'autoedits-short-term-diff',
            longTermContextLines: this.longTermContextLines,
            shortTermContextLines: this.shortTermContextLines,
            shortTermDiffWindowMs: this.shortTermDiffWindowMs,
        }
    }
}
