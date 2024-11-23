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
import { type TextDocumentChangeGroup, combineNonOverlappingLinesSchemaTogether } from './utils'

/**
 * Generates a single unified diff patch that combines all changes
 * made to a document into one consolidated view.
 */
export class AutoeditWithShortTermDiffStrategy implements RecentEditsRetrieverDiffStrategy {
    private shortTermContextLines = 0

    public getDiffHunks(input: DiffCalculationInput): DiffHunk[] {
        const rawChanges = groupChangesForSimilarLinesTogether(input.changes)
        const rawDiffHunks = this.getDiffHunksFromGroupedChanges(input, rawChanges)
        const changes = combineNonOverlappingLinesSchemaTogether(rawChanges)
        const combinedDiffHunks = this.getDiffHunksFromGroupedChanges(input, changes)

        this.logRawDataPoints(input.uri.toString(), input.oldContent, rawDiffHunks, combinedDiffHunks)
        return combinedDiffHunks
    }

    private getDiffHunksFromGroupedChanges(
        input: DiffCalculationInput,
        changes: TextDocumentChangeGroup[]
    ): DiffHunk[] {
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
        return allDiffHunks
    }

    private logRawDataPoints(uri: string, oldContent: string, rawDiffHunks: DiffHunk[], combinedDiffHunks: DiffHunk[]) {
        const dirPath = '/Users/hiteshsagtani/Desktop/raw-diff-logs'
        const fileName = uri.split('/').pop()?.split('.')[0] || 'document'
        const logPath = uri.replace(/[^/\\]+$/, `${fileName}_raw.jsonl`)
        const finalLogPath = path.join(dirPath, path.basename(logPath))
        const fs = require('fs')

        // Create directory if it doesn't exist
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true })
        }

        const logData = {
            uri: uri.toString(),
            oldContent,
            rawDiffHunks,
            combinedDiffHunks
        }
        // Append to file if it exists, create if it doesn't
        fs.appendFileSync(
            finalLogPath,
            JSON.stringify(logData) + '\n',
            { encoding: 'utf8' }
        )
    }

    private logGroupedChanges(uri: vscode.Uri, oldContent: string, changes: TextDocumentChangeGroup[]) {
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
}
