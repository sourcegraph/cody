import type * as vscode from 'vscode'
import type { DiffCalculationInput, DiffHunk, RecentEditsRetrieverDiffStrategy } from './base'
import { groupNonOverlappingChangeGroups, groupOverlappingDocumentChanges } from './utils'
import {
    type TextDocumentChangeGroup,
    divideGroupedChangesIntoShortTermAndLongTerm,
    getDiffHunkFromUnifiedPatch,
    getUnifiedDiffHunkFromTextDocumentChange,
} from './utils'

interface StrategyOptions {
    shouldGroupNonOverlappingLines: boolean
}

export class LineLevelDiffStrategy implements RecentEditsRetrieverDiffStrategy {
    private contextLines = 3
    private shouldGroupNonOverlappingLines: boolean

    constructor(options: StrategyOptions) {
        this.shouldGroupNonOverlappingLines = options.shouldGroupNonOverlappingLines
    }

    public getDiffHunks(input: DiffCalculationInput): DiffHunk[] {
        const groupedChanges = this.getLineLevelChanges(input)
        const diffHunks = this.getDiffHunksForGroupedChanges({
            uri: input.uri,
            oldContent: input.oldContent,
            groupedChanges,
            contextLines: this.contextLines,
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
        if (!this.shouldGroupNonOverlappingLines) {
            return changes
        }
        let { shortTermChanges, longTermChanges } = divideGroupedChangesIntoShortTermAndLongTerm(changes)
        longTermChanges = groupNonOverlappingChangeGroups(longTermChanges)
        return [...longTermChanges, ...shortTermChanges]
    }

    public getDiffStrategyName(): string {
        return `line-level-diff-${
            this.shouldGroupNonOverlappingLines ? 'non-overlap-lines-true' : 'non-overlap-lines-false'
        }`
    }
}
