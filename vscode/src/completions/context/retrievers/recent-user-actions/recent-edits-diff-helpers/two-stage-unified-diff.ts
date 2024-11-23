import type {
    DiffCalculationInput,
    DiffHunk,
    RecentEditsRetrieverDiffStrategy,
    TextDocumentChange,
} from './base'
import { groupOverlappingDocumentChanges } from './utils'
import {
    type TextDocumentChangeGroup,
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
            this.divideChangesIntoShortTermAndLongTerm(rawChanges)

        const longTermPatch = getUnifiedDiffHunkFromTextDocumentChange({
            uri: input.uri,
            oldContent: input.oldContent,
            changes: longTermChanges,
            addLineNumbersForDiff: true,
            contextLines: this.longTermContextLines,
        })
        const shortTermPatch = getUnifiedDiffHunkFromTextDocumentChange({
            uri: input.uri,
            oldContent: longTermPatch?.newContent || input.oldContent,
            changes: shortTermChanges,
            addLineNumbersForDiff: true,
            contextLines: this.shortTermContextLines,
        })
        return [
            getDiffHunkFromUnifiedPatch(shortTermPatch),
            getDiffHunkFromUnifiedPatch(longTermPatch),
        ].filter((hunk): hunk is DiffHunk => hunk !== undefined)
    }

    private divideChangesIntoShortTermAndLongTerm(changes: TextDocumentChangeGroup[]): {
        shortTermChanges: TextDocumentChange[]
        longTermChanges: TextDocumentChange[]
    } {
        if (changes.length <= 1) {
            return {
                shortTermChanges: this.convertTextDocumentChangeGroupToTextDocumentChange(changes),
                longTermChanges: [],
            }
        }
        return {
            shortTermChanges: this.convertTextDocumentChangeGroupToTextDocumentChange(changes.slice(-1)),
            longTermChanges: this.convertTextDocumentChangeGroupToTextDocumentChange(
                changes.slice(0, -1)
            ),
        }
    }

    private convertTextDocumentChangeGroupToTextDocumentChange(
        changeGroup: TextDocumentChangeGroup[]
    ): TextDocumentChange[] {
        return changeGroup.flatMap(group => group.changes)
    }

    public getDiffStrategyName(): string {
        return 'two-stage-unified-diff-strategy'
    }
}
