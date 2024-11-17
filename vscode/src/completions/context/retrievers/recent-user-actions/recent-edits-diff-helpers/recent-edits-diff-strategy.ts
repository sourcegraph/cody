import type { PromptString } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { UnifiedDiffStrategy } from './unified-diff'
import { UnifiedDiffStrategyWithLineNumbers } from './unified-diff-with-lines'

export enum RecentEditsRetrieverDiffStrategyIdentifier {
    UnifiedDiff = 'unified-diff',
    UnifiedDiffWithLineNumbers = 'unified-diff-with-line-numbers',
}

export interface RecentEditsRetrieverDiffStrategy {
    getDiffHunks(input: DiffCalculationInput): DiffHunk[]
}

export interface TextDocumentChange {
    timestamp: number
    change: vscode.TextDocumentContentChangeEvent
}

export interface DiffCalculationInput {
    uri: vscode.Uri
    oldContent: string
    changes: TextDocumentChange[]
}

export interface DiffHunk {
    latestEditTimestamp: number
    diff: PromptString
}

export function createDiffStrategy(
    identifier: RecentEditsRetrieverDiffStrategyIdentifier
): RecentEditsRetrieverDiffStrategy {
    switch (identifier) {
        case RecentEditsRetrieverDiffStrategyIdentifier.UnifiedDiff:
            return new UnifiedDiffStrategy()
        case RecentEditsRetrieverDiffStrategyIdentifier.UnifiedDiffWithLineNumbers:
            return new UnifiedDiffStrategyWithLineNumbers()
        default:
            throw new Error(`Unknown diff strategy identifier: ${identifier}`)
    }
}
