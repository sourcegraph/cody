import type { PromptString } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { AutoeditWithShortTermDiffStrategy } from './auotedit-short-term-diff'
import { UnifiedDiffStrategy } from './unified-diff'

/**
 * Identifiers for the different diff strategies.
 */
export enum RecentEditsRetrieverDiffStrategyIdentifier {
    /**
     * Unified diff strategy that shows changes in a single patch.
     */
    UnifiedDiff = 'unified-diff',
    /**
     * Unified diff strategy that shows changes in a single patch.
     */
    UnifiedDiffWithLineNumbers = 'unified-diff-with-line-numbers',
    /**
     * Diff Strategy to use a seperate short term diff used by `auto-edits`.
     */
    AutoeditWithShortTermDiff = 'autoedit-with-short-term-diff',
}

/**
 * Creates a new instance of a diff strategy based on the provided identifier.
 * @param identifier The identifier of the diff strategy to create.
 * @returns A new instance of the diff strategy.
 */
export function createDiffStrategy(
    identifier: RecentEditsRetrieverDiffStrategyIdentifier
): RecentEditsRetrieverDiffStrategy {
    switch (identifier) {
        case RecentEditsRetrieverDiffStrategyIdentifier.UnifiedDiff:
            return new UnifiedDiffStrategy({ addLineNumbers: false })
        case RecentEditsRetrieverDiffStrategyIdentifier.UnifiedDiffWithLineNumbers:
            return new UnifiedDiffStrategy({ addLineNumbers: true })
        case RecentEditsRetrieverDiffStrategyIdentifier.AutoeditWithShortTermDiff:
            return new AutoeditWithShortTermDiffStrategy()
        default:
            throw new Error(`Unknown diff strategy identifier: ${identifier}`)
    }
}

export interface RecentEditsRetrieverDiffStrategy {
    getDiffHunks(input: DiffCalculationInput): DiffHunk[]
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
