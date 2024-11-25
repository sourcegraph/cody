import type { AutocompleteContextSnippetMetadataFields } from '@sourcegraph/cody-shared'
import type { DiffCalculationInput, DiffHunk, RecentEditsRetrieverDiffStrategy } from './base'
import { getUnifiedDiffHunkFromTextDocumentChange } from './utils'

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
        const diffHunk = getUnifiedDiffHunkFromTextDocumentChange({
            uri: input.uri,
            oldContent: input.oldContent,
            changes: input.changes,
            addLineNumbersForDiff: this.addLineNumbers,
            contextLines: this.numContextLines,
        })
        return diffHunk ? [diffHunk] : []
    }

    public getDiffStrategyMetadata(): AutocompleteContextSnippetMetadataFields {
        return {
            strategy: 'unified-diff',
        }
    }
}
