import type { PromptString } from '@sourcegraph/cody-shared'
import type { AutocompleteContextSnippetMetadataFields } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'

/**
 * Defines a strategy for processing and transforming low-level document changes into meaningful diff hunks
 * that can be used as context for LLM consumption.
 *
 * This interface serves as a contract for different diff calculation strategies that can:
 * 1. Take raw VSCode document changes and convert them into more coherent, higher-level edits
 * 2. Group related changes together (like consecutive character typing or related line edits)
 *
 * Common implementations include:
 * - Unified diff strategy: Combines all changes into a single coherent diff.
 * - Line-level diff strategy: Groups character-by-character changes into logical line-based units.
 *   The logical unit is `TextDocumentChangeGroup` interface in `utils.ts`.
 */
export interface RecentEditsRetrieverDiffStrategy {
    /**
     * Processes raw document changes and generates meaningful diff hunks.
     * @param input Contains the document URI, original content, and array of individual changes
     * @returns Array of DiffHunk objects representing logical groups of changes
     */
    getDiffHunks(input: DiffCalculationInput): DiffHunk[]

    /**
     * Provides metadata about the diff strategy for analysis and logging purposes.
     * Used to track strategy performance and tune parameters offline.
     * @returns Metadata fields about the strategy's behavior and configuration
     */
    getDiffStrategyMetadata(): AutocompleteContextSnippetMetadataFields
}

export interface TextDocumentChange {
    timestamp: number
    change: vscode.TextDocumentContentChangeEvent
    // The range in the document where the text was inserted.
    insertedRange: vscode.Range
}

export interface DiffCalculationInput {
    uri: vscode.Uri
    oldContent: string
    changes: TextDocumentChange[]
}

export interface DiffHunk {
    uri: vscode.Uri
    latestEditTimestamp: number
    diff: PromptString
}

export interface UnifiedPatchResponse {
    uri: vscode.Uri
    newContent: string
    diff: PromptString
    latestEditTimestamp: number
}
