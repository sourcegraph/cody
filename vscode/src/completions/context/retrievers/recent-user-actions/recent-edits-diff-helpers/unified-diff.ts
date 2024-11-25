import { PromptString } from '@sourcegraph/cody-shared'
import type { AutocompleteContextSnippetMetadataFields } from '../../../../../../../lib/shared/src/completions/types'
import type {
    DiffCalculationInput,
    DiffHunk,
    RecentEditsRetrieverDiffStrategy,
} from './recent-edits-diff-strategy'
import { applyTextDocumentChanges, computeDiffWithLineNumbers } from './utils'

interface UnifiedDiffStrategyOptions {
    addLineNumbers: boolean
}

/**
 * Generates a single unified diff patch that combines all changes
 * made to a document into one consolidated view.
 */
export class UnifiedDiffStrategy implements RecentEditsRetrieverDiffStrategy {
    private addLineNumbers: boolean
    private readonly numContextLines = 3

    constructor(options: UnifiedDiffStrategyOptions) {
        this.addLineNumbers = options.addLineNumbers
    }

    public getDiffHunks(input: DiffCalculationInput): DiffHunk[] {
        const newContent = applyTextDocumentChanges(
            input.oldContent,
            input.changes.map(c => c.change)
        )
        const diff = this.getDiffForUnifiedStrategy(input, newContent)
        return [
            {
                uri: input.uri,
                diff,
                latestEditTimestamp: Math.max(...input.changes.map(c => c.timestamp)),
            },
        ]
    }

    private getDiffForUnifiedStrategy(input: DiffCalculationInput, newContent: string): PromptString {
        if (this.addLineNumbers) {
            return computeDiffWithLineNumbers(
                input.uri,
                input.oldContent,
                newContent,
                this.numContextLines
            )
        }
        return PromptString.fromGitDiff(input.uri, input.oldContent, newContent)
    }

    public getDiffStrategyMetadata(): AutocompleteContextSnippetMetadataFields {
        return {
            strategy: 'unified-diff',
        }
    }
}
