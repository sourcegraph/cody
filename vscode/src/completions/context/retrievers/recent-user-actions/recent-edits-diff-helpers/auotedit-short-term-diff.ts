import path from 'node:path'
import type * as vscode from 'vscode'
import type {
    DiffCalculationInput,
    DiffHunk,
    RecentEditsRetrieverDiffStrategy,
    TextDocumentChange,
} from './base'
import {
    applyTextDocumentChanges,
    computeDiffWithLineNumbers,
    groupChangesForSimilarLinesTogether,
} from './utils'
import { type GroupedTextDocumentChange, combineDiffHunksFromSimilarFile } from './utils'

/**
 * Generates a single unified diff patch that combines all changes
 * made to a document into one consolidated view.
 */
export class AutoeditWithShortTermDiffStrategy implements RecentEditsRetrieverDiffStrategy {
    private shortTermDiffWindowMs = 5 * 1000 // 5 seconds
    private longTermContextLines = 3
    private shortTermContextLines = 0

    public getDiffHunks(input: DiffCalculationInput): DiffHunk[] {
        const changes = groupChangesForSimilarLinesTogether(input.changes)
        this.logGroupedChanges(input.uri, input.oldContent, changes)
        const allDiffHunks: DiffHunk[] = []

        let oldContent = input.oldContent
        for (const changeList of changes) {
            const [diffHunk, newContent] = this.getDiffHunksForChanges(
                input.uri,
                oldContent,
                changeList.changes,
                this.shortTermContextLines
            )
            oldContent = newContent
            allDiffHunks.push(diffHunk)
        }
        return combineDiffHunksFromSimilarFile(allDiffHunks)

        // const [shortTermChanges, longTermChanges] = this.divideChangesIntoWindows(input.changes)
        // const [shortTermHunks, shortTermNewContent] = this.getDiffHunksForChanges(
        //     input.uri,
        //     input.oldContent,
        //     shortTermChanges,
        //     this.shortTermContextLines
        // )
        // const [longTermHunks, _] = this.getDiffHunksForChanges(
        //     input.uri,
        //     shortTermNewContent,
        //     longTermChanges,
        //     this.longTermContextLines
        // )
        // return [shortTermHunks, longTermHunks]
    }

    private logGroupedChanges(
        uri: vscode.Uri,
        oldContent: string,
        changes: GroupedTextDocumentChange[]
    ) {
        const fileName = uri.fsPath.split('/').pop()?.split('.')[0] || 'document'
        const logPath = uri.fsPath.replace(/[^/\\]+$/, `${fileName}_grouped.json`)
        const finalLogPath = path.join('/Users/hiteshsagtani/Desktop/diff-logs', path.basename(logPath))
        const fs = require('fs')
        const logData = {
            uri: uri.toString(),
            oldContent: oldContent,
            changes: changes.map(c => c.changes),
        }
        fs.writeFileSync(finalLogPath, JSON.stringify(logData, null, 2))
    }

    private getDiffHunksForChanges(
        uri: vscode.Uri,
        oldContent: string,
        changes: TextDocumentChange[],
        numContextLines: number
    ): [DiffHunk, string] {
        const newContent = applyTextDocumentChanges(
            oldContent,
            changes.map(c => c.change)
        )
        const gitDiff = computeDiffWithLineNumbers(uri, oldContent, newContent, numContextLines)
        const diffHunk = {
            uri,
            leastEditTimestamp: Math.min(...changes.map(c => c.timestamp)),
            latestEditTimestamp: Math.max(...changes.map(c => c.timestamp)),
            diff: gitDiff,
        }
        return [diffHunk, newContent]
    }

    private divideChangesIntoWindows(
        changes: TextDocumentChange[]
    ): [TextDocumentChange[], TextDocumentChange[]] {
        // Divide the changes into 2 different windows, where the second window is the short term changes under 5 seconds
        const now = Date.now()
        const index = changes.findIndex(c => now - c.timestamp < this.shortTermDiffWindowMs)
        const shortTermChanges = changes.slice(0, index)
        const longTermChanges = changes.slice(index)
        return [shortTermChanges, longTermChanges]
    }
}
