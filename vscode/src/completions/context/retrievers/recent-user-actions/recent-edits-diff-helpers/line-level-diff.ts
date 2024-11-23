import type { DiffCalculationInput, DiffHunk, RecentEditsRetrieverDiffStrategy } from './base'
import { groupNonOverlappingChangeGroups, groupOverlappingDocumentChanges } from './utils'
import {
    type TextDocumentChangeGroup,
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
        const diffHunks: DiffHunk[] = []
        let oldContent = input.oldContent
        for (const groupedChange of groupedChanges) {
            const patch = getUnifiedDiffHunkFromTextDocumentChange({
                uri: input.uri,
                oldContent: oldContent,
                changes: groupedChange.changes,
                addLineNumbersForDiff: true,
                contextLines: this.contextLines,
            })
            if (patch) {
                const hunk = getDiffHunkFromUnifiedPatch(patch)
                if (hunk) {
                    diffHunks.push(hunk)
                }
                oldContent = patch.newContent
            }
        }
        return diffHunks
    }

    private getLineLevelChanges(input: DiffCalculationInput): TextDocumentChangeGroup[] {
        const changes = groupOverlappingDocumentChanges(input.changes)
        if (!this.shouldGroupNonOverlappingLines) {
            return changes
        }
        return groupNonOverlappingChangeGroups(changes)
    }

    public getDiffStrategyName(): string {
        return `line-level-diff-${
            this.shouldGroupNonOverlappingLines ? 'non-overlap-lines-true' : 'non-overlap-lines-false'
        }`
    }
}
