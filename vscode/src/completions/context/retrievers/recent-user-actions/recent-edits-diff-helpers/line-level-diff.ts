import type * as vscode from 'vscode'
import type { DiffCalculationInput, DiffHunk, RecentEditsRetrieverDiffStrategy } from './base'
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
        if (this.options.longTermDiffCombinationStrategy === 'lines-based') {
            longTermChanges = groupNonOverlappingChangeGroups(longTermChanges)
        } else if (this.options.longTermDiffCombinationStrategy === 'unified-diff') {
            longTermChanges = [combineTextDocumentGroups(longTermChanges)]
        }
        return [...longTermChanges, ...shortTermChanges]
    }

    public getDiffStrategyName(): string {
        return 'line-level-diff'
    }
}
