import type { AutocompleteContextSnippetMetadataFields } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import type {
    DiffCalculationInput,
    DiffHunk,
    RecentEditsRetrieverDiffStrategy,
} from './recent-edits-diff-strategy'
import { groupNonOverlappingChangeGroups, groupOverlappingDocumentChanges } from './utils'
import {
    type TextDocumentChangeGroup,
    combineTextDocumentGroups,
    divideGroupedChangesIntoShortTermAndLongTerm,
    getDiffHunkFromUnifiedPatch,
    getUnifiedDiffHunkFromTextDocumentChange,
} from './utils'

export interface LineLevelStrategyOptions {
    contextLines: number
    longTermDiffCombinationStrategy: 'unified-diff' | 'lines-based' | undefined
    minShortTermEvents: number
    minShortTermTimeMs: number
}

/**
 * Strategy for computing diffs that maintains granular edit history while offering configurable handling of long-term changes.
 *
 * Key features:
 * - Separates changes into short-term (recent) and long-term (older) groups based on time and event count thresholds
 * - Provides two strategies for handling long-term changes:
 *   - 'unified-diff': Combines all long-term changes into a single consolidated diff per file
 *   - 'lines-based': Groups non-overlapping long-term changes while preserving their individual granularity
 * - Preserves full edit history for short-term changes
 * - Allows configurable context lines around each change
 *
 * @param options Configuration options including context lines, combination strategy, and thresholds
 */
export class LineLevelDiffStrategy implements RecentEditsRetrieverDiffStrategy {
    constructor(private readonly options: LineLevelStrategyOptions) {}

    public getDiffHunks(input: DiffCalculationInput): DiffHunk[] {
        const groupedChanges = this.getLineLevelChanges(input)
        const diffHunks = this.getDiffHunksForGroupedChanges({
            uri: input.uri,
            oldContent: input.oldContent,
            groupedChanges,
            contextLines: this.options.contextLines,
            addLineNumbersForDiff: true,
        }).filter(diffHunk => diffHunk.diff.toString() !== '')
        diffHunks.reverse()
        return diffHunks
    }

    private getDiffHunksForGroupedChanges(params: {
        uri: vscode.Uri
        oldContent: string
        groupedChanges: TextDocumentChangeGroup[]
        contextLines: number
        addLineNumbersForDiff: boolean
    }): DiffHunk[] {
        let currentContent = params.oldContent
        const diffHunks: DiffHunk[] = []
        for (const groupedChange of params.groupedChanges) {
            const patch = getUnifiedDiffHunkFromTextDocumentChange({
                uri: params.uri,
                oldContent: currentContent,
                changes: groupedChange.changes,
                addLineNumbersForDiff: params.addLineNumbersForDiff,
                contextLines: params.contextLines,
            })
            const hunk = getDiffHunkFromUnifiedPatch(patch)
            diffHunks.push(hunk)
            currentContent = patch.newContent
        }
        return diffHunks
    }

    private getLineLevelChanges(input: DiffCalculationInput): TextDocumentChangeGroup[] {
        const changes = groupOverlappingDocumentChanges(input.changes)
        if (this.options.longTermDiffCombinationStrategy === undefined) {
            return changes
        }
        let { shortTermChanges, longTermChanges } = divideGroupedChangesIntoShortTermAndLongTerm({
            changes,
            minEvents: this.options.minShortTermEvents,
            minTimeMs: this.options.minShortTermTimeMs,
        })
        switch (this.options.longTermDiffCombinationStrategy) {
            case 'lines-based':
                longTermChanges = groupNonOverlappingChangeGroups(longTermChanges)
                break
            case 'unified-diff':
                longTermChanges = [combineTextDocumentGroups(longTermChanges)]
                break
        }
        return [...longTermChanges, ...shortTermChanges]
    }

    public getDiffStrategyMetadata(): AutocompleteContextSnippetMetadataFields {
        return {
            strategy: 'line-level',
            contextLines: this.options.contextLines,
            longTermDiffCombinationStrategy: this.options.longTermDiffCombinationStrategy as string,
            minShortTermEvents: this.options.minShortTermEvents,
            minShortTermTimeMs: this.options.minShortTermTimeMs,
        }
    }
}
