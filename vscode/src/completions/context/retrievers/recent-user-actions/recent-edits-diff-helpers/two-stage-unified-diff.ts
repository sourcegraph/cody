import type { AutocompleteContextSnippetMetadataFields } from '@sourcegraph/cody-shared'
import type {
    DiffCalculationInput,
    DiffHunk,
    RecentEditsRetrieverDiffStrategy,
} from './recent-edits-diff-strategy'
import { groupOverlappingDocumentChanges } from './utils'
import {
    divideGroupedChangesIntoShortTermAndLongTerm,
    getDiffHunkFromUnifiedPatch,
    getUnifiedDiffHunkFromTextDocumentChange,
} from './utils'

interface StrategyOptions {
    longTermContextLines: number
    shortTermContextLines: number
    minShortTermEvents: number
    minShortTermTimeMs: number
}

/**
 * A diff strategy that generates two distinct unified diff patches per file - one for long-term changes
 * and one for short-term changes.
 *
 * Key characteristics:
 * 1. Two-Stage Processing:
 *    - First stage: Generates a unified diff for all long-term changes with wider context
 *    - Second stage: Generates a separate diff for recent changes with tighter context
 *
 * 2. Change Classification:
 *    - Long-term changes: Older modifications that exceed the minShortTermTimeMs threshold
 *    - Short-term changes: Recent modifications within the time/event thresholds
 *
 * 3. Context Control:
 *    - longTermContextLines: Wider context for historical changes to show more surrounding code
 *    - shortTermContextLines: Tighter context for recent changes to focus on immediate modifications
 *
 * 4. Consolidated View:
 *    - Always produces exactly two patches per changed file
 *    - Long-term patch provides historical context
 *    - Short-term patch shows recent modifications relative to the long-term state
 *
 * This strategy is particularly useful when you want to clearly separate recent edits
 * from historical changes while maintaining a clean, consolidated diff view.
 */
export class TwoStageUnifiedDiffStrategy implements RecentEditsRetrieverDiffStrategy {
    constructor(private readonly options: StrategyOptions) {}

    public getDiffHunks(input: DiffCalculationInput): DiffHunk[] {
        const rawChanges = groupOverlappingDocumentChanges(input.changes)
        const { shortTermChanges, longTermChanges } = divideGroupedChangesIntoShortTermAndLongTerm({
            changes: rawChanges,
            minEvents: this.options.minShortTermEvents,
            minTimeMs: this.options.minShortTermTimeMs,
        })

        const longTermPatch = getUnifiedDiffHunkFromTextDocumentChange({
            uri: input.uri,
            oldContent: input.oldContent,
            changes: longTermChanges.flatMap(c => c.changes),
            addLineNumbersForDiff: true,
            contextLines: this.options.longTermContextLines,
        })
        const shortTermPatch = getUnifiedDiffHunkFromTextDocumentChange({
            uri: input.uri,
            oldContent: longTermPatch.newContent,
            changes: shortTermChanges.flatMap(c => c.changes),
            addLineNumbersForDiff: true,
            contextLines: this.options.shortTermContextLines,
        })
        const diffs = [
            getDiffHunkFromUnifiedPatch(shortTermPatch),
            getDiffHunkFromUnifiedPatch(longTermPatch),
        ].filter(diff => diff.diff.length > 0)
        return diffs
    }

    public getDiffStrategyMetadata(): AutocompleteContextSnippetMetadataFields {
        return {
            strategy: 'two-stage-unified-diff',
            longTermContextLines: this.options.longTermContextLines,
            shortTermContextLines: this.options.shortTermContextLines,
            minShortTermEvents: this.options.minShortTermEvents,
            minShortTermTimeMs: this.options.minShortTermTimeMs,
        }
    }
}
