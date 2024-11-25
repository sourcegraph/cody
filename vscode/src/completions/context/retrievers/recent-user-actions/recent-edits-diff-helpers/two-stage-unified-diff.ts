import type { AutocompleteContextSnippetMetadataFields } from '../../../../../../../lib/shared/src/completions/types'
import type { DiffCalculationInput, DiffHunk, RecentEditsRetrieverDiffStrategy } from './base'
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
 * Generates a single unified diff patch that combines all changes
 * made to a document into one consolidated view.
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
