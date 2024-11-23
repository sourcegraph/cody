import type { DiffCalculationInput, DiffHunk, RecentEditsRetrieverDiffStrategy } from './base'
import { groupOverlappingDocumentChanges } from './utils'
import {
    divideGroupedChangesIntoShortTermAndLongTerm,
    getDiffHunkFromUnifiedPatch,
    getUnifiedDiffHunkFromTextDocumentChange,
} from './utils'

/**
 * Generates a single unified diff patch that combines all changes
 * made to a document into one consolidated view.
 */
export class TwoStageUnifiedDiffStrategy implements RecentEditsRetrieverDiffStrategy {
    private longTermContextLines = 3
    private shortTermContextLines = 0

    public getDiffHunks(input: DiffCalculationInput): DiffHunk[] {
        const rawChanges = groupOverlappingDocumentChanges(input.changes)
        const { shortTermChanges, longTermChanges } =
            divideGroupedChangesIntoShortTermAndLongTerm(rawChanges)

        const longTermPatch = getUnifiedDiffHunkFromTextDocumentChange({
            uri: input.uri,
            oldContent: input.oldContent,
            changes: longTermChanges.flatMap(c => c.changes),
            addLineNumbersForDiff: true,
            contextLines: this.longTermContextLines,
        })
        const shortTermPatch = getUnifiedDiffHunkFromTextDocumentChange({
            uri: input.uri,
            oldContent: longTermPatch.newContent,
            changes: shortTermChanges.flatMap(c => c.changes),
            addLineNumbersForDiff: true,
            contextLines: this.shortTermContextLines,
        })
        const diffs = [
            getDiffHunkFromUnifiedPatch(shortTermPatch),
            getDiffHunkFromUnifiedPatch(longTermPatch),
        ].filter(diff => diff.diff.length > 0)
        return diffs
    }

    public getDiffStrategyName(): string {
        return 'two-stage-unified-diff-strategy'
    }
}
