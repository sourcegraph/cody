import { PromptString } from '@sourcegraph/cody-shared'
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
export class UnifiedDiffStrategy implements RecentEditsRetrieverDiffStrategy {
    public getDiffHunks(input: DiffCalculationInput): DiffHunk[] {
        const newContent = applyTextDocumentChanges(
            input.oldContent,
            input.changes.map(c => c.change)
        )
        const diff = PromptString.fromGitDiff(input.uri, input.oldContent, newContent)
        return [
            {
                diff,
                latestEditTimestamp: Math.max(...input.changes.map(c => c.timestamp)),
            },
        ]
    }
}
